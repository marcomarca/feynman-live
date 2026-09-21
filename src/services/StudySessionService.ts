import type { LiveTutorProvider } from "../adapters/gemini/GeminiLiveAdapter";
import type { SessionRecoveryPolicy } from "../adapters/gemini/GeminiSessionRecovery";
import { DefaultSessionRecoveryPolicy } from "../adapters/gemini/GeminiSessionRecovery";
import type { DataStorePort } from "../adapters/persistence/AppDataStore";
import type { ChatStorePort } from "../adapters/persistence/ChatHistoryStore";
import type { SecretStorePort } from "../adapters/persistence/SafeStorageSecretStore";
import { WavEncoder } from "../adapters/persistence/WavEncoder";
import { type AppError, createAppError } from "../domain/app-error";
import type { ChatMessage } from "../domain/chat";
import { type Result, err, isErr, ok } from "../domain/result";
import type { SessionState } from "../domain/session-state";

function mergeUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export interface VoiceTurnRuntime {
  turnId: number;
  connectionGeneration: number;
  speechStartedAt: number;
  speechEndedAt?: number;
  audioStreamEndedAt?: number;
  firstServerAckAt?: number;
  finalTranscriptAt?: number;
  firstModelOutputAt?: number;
  lastServerEventAt?: number;
  retryCount: number;
  serverAcknowledgedInput: boolean;
}

const MAX_USER_AUDIO_BYTES = 30 * 16000 * 2; // ~960,000 bytes (30s at 16kHz 16-bit mono)
const WATCHDOG_A_TIMEOUT_MS = 5000;
const WATCHDOG_B_TIMEOUT_MS = 10000;
const WATCHDOG_C_TIMEOUT_MS = 15000;

export interface WatchdogTimeouts {
  ackTimeoutMs?: number;
  startTimeoutMs?: number;
  stalledTimeoutMs?: number;
}

export class StudySessionService {
  private state: SessionState = { status: "idle" };
  private stateListeners: Set<(state: SessionState) => void> = new Set();
  private audioListeners: Set<(chunk: Uint8Array) => void> = new Set();
  private textDeltaListeners: Set<(delta: string) => void> = new Set();
  private messageCompleteListeners: Set<(message: ChatMessage) => void> = new Set();
  private interruptedListeners: Set<() => void> = new Set();

  private currentChatId: string | null = null;
  private currentModelText = "";
  private currentUserTranscription = "";
  private currentModelAudioChunks: Uint8Array[] = [];
  private currentUserAudioChunks: Uint8Array[] = [];
  private currentUserAudioBytes = 0;

  private currentTurn: VoiceTurnRuntime | null = null;
  private activeTurnId = 0;

  private watchdogATimeout: ReturnType<typeof setTimeout> | null = null;
  private watchdogBTimeout: ReturnType<typeof setTimeout> | null = null;
  private watchdogCTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly watchdogTimeouts: Required<WatchdogTimeouts>;

  private reconnectAttempt = 0;
  private isMuted = false;
  private isAwaitingTextResponse = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dataStore: DataStorePort,
    private readonly secretStore: SecretStorePort,
    private readonly provider: LiveTutorProvider,
    private readonly chatStore?: ChatStorePort,
    private readonly recoveryPolicy: SessionRecoveryPolicy = new DefaultSessionRecoveryPolicy(),
    watchdogTimeouts?: WatchdogTimeouts,
  ) {
    this.watchdogTimeouts = {
      ackTimeoutMs: watchdogTimeouts?.ackTimeoutMs ?? WATCHDOG_A_TIMEOUT_MS,
      startTimeoutMs: watchdogTimeouts?.startTimeoutMs ?? WATCHDOG_B_TIMEOUT_MS,
      stalledTimeoutMs: watchdogTimeouts?.stalledTimeoutMs ?? WATCHDOG_C_TIMEOUT_MS,
    };
    this.setupProviderListeners();
  }

  private setupProviderListeners(): void {
    this.provider.onAudioChunk((chunk) => {
      this.clearWatchdogB();
      this.startWatchdogC();

      if (this.currentTurn) {
        if (!this.currentTurn.firstModelOutputAt) {
          this.currentTurn.firstModelOutputAt = Date.now();
        }
        this.currentTurn.lastServerEventAt = Date.now();
      }

      if (this.state.status === "listening" || this.state.status === "speaking") {
        // Forward audio chunk immediately to renderer for lowest latency playback
        this.currentModelAudioChunks.push(chunk);
        for (const listener of this.audioListeners) {
          listener(chunk);
        }

        if (this.state.status !== "speaking") {
          this.setState({ status: "speaking", startedAt: Date.now() });
          this.flushUserAudioMessage();
        }
      }
    });

    this.provider.onTextDelta((delta) => {
      this.clearWatchdogB();
      this.startWatchdogC();

      if (this.currentTurn) {
        if (!this.currentTurn.firstModelOutputAt) {
          this.currentTurn.firstModelOutputAt = Date.now();
        }
        this.currentTurn.lastServerEventAt = Date.now();
      }

      this.currentModelText += delta;
      for (const listener of this.textDeltaListeners) {
        listener(delta);
      }
    });

    this.provider.onUserTranscription((text) => {
      this.clearWatchdogA();
      if (this.currentTurn) {
        this.currentTurn.serverAcknowledgedInput = true;
        this.currentTurn.finalTranscriptAt = Date.now();
        this.currentTurn.lastServerEventAt = Date.now();
      }
      this.startWatchdogB();

      this.currentUserTranscription += (this.currentUserTranscription ? " " : "") + text;
    });

    this.provider.onServerAck(() => {
      this.clearWatchdogA();
      if (this.currentTurn) {
        this.currentTurn.serverAcknowledgedInput = true;
        if (!this.currentTurn.firstServerAckAt) {
          this.currentTurn.firstServerAckAt = Date.now();
        }
        this.currentTurn.lastServerEventAt = Date.now();
      }
      this.startWatchdogB();
    });

    this.provider.onModelOutputStarted(() => {
      this.clearWatchdogB();
      this.startWatchdogC();
      if (this.currentTurn) {
        if (!this.currentTurn.firstModelOutputAt) {
          this.currentTurn.firstModelOutputAt = Date.now();
        }
        this.currentTurn.lastServerEventAt = Date.now();
      }
    });

    this.provider.onTurnComplete(() => {
      this.clearWatchdogs();
      this.reconnectAttempt = 0; // Reset retry budget only on full successful turn completion
      this.currentTurn = null;

      this.isAwaitingTextResponse = false;
      this.flushModelMessage();
      if (this.state.status === "speaking") {
        this.setState({ status: "listening", startedAt: Date.now() });
      }
    });

    this.provider.onInterrupted(() => {
      this.clearWatchdogs();
      this.currentTurn = null;

      this.isAwaitingTextResponse = false;
      this.flushModelMessage();
      for (const listener of this.interruptedListeners) {
        listener();
      }
      if (this.state.status === "speaking") {
        this.setState({ status: "listening", startedAt: Date.now() });
      }
    });

    this.provider.onError(async (error) => {
      this.clearWatchdogs();
      this.isAwaitingTextResponse = false;
      await this.handleProviderError(error);
    });

    this.provider.onClose(async () => {
      this.clearWatchdogs();
      this.isAwaitingTextResponse = false;
      if (this.state.status !== "idle" && this.state.status !== "stopping") {
        await this.handleProviderError(
          createAppError("CONNECTION_CLOSED", "Conexión cerrada", undefined, true),
        );
      }
    });
  }

  handleSpeechStart(): void {
    if (this.state.status !== "listening" && this.state.status !== "speaking") return;

    if (this.state.status === "speaking") {
      this.clearWatchdogs();
      this.flushModelMessage();
      this.setState({ status: "listening", startedAt: Date.now() });
    }

    this.activeTurnId += 1;
    this.currentTurn = {
      turnId: this.activeTurnId,
      connectionGeneration: this.provider.getConnectionGeneration(),
      speechStartedAt: Date.now(),
      retryCount: 0,
      serverAcknowledgedInput: false,
    };

    this.currentUserAudioChunks = [];
    this.currentUserAudioBytes = 0;
  }

  handleAudioStreamEnd(): void {
    if (this.state.status !== "listening" && this.state.status !== "speaking") return;

    if (this.currentTurn) {
      this.currentTurn.speechEndedAt = Date.now();
      this.currentTurn.audioStreamEndedAt = Date.now();
    }

    this.provider.endAudioStream();
    this.startWatchdogA();
  }

  getCurrentTurn(): VoiceTurnRuntime | null {
    return this.currentTurn;
  }

  private startWatchdogA(): void {
    this.clearWatchdogs();
    this.watchdogATimeout = setTimeout(() => {
      void this.handleWatchdogATriggered();
    }, this.watchdogTimeouts.ackTimeoutMs);
  }

  private startWatchdogB(): void {
    this.clearWatchdogA();
    this.clearWatchdogB();
    this.watchdogBTimeout = setTimeout(() => {
      void this.handleWatchdogBTriggered();
    }, this.watchdogTimeouts.startTimeoutMs);
  }

  private startWatchdogC(): void {
    this.clearWatchdogA();
    this.clearWatchdogB();
    if (this.watchdogCTimeout) {
      clearTimeout(this.watchdogCTimeout);
    }
    this.watchdogCTimeout = setTimeout(() => {
      void this.handleWatchdogCTriggered();
    }, this.watchdogTimeouts.stalledTimeoutMs);
  }

  private clearWatchdogA(): void {
    if (this.watchdogATimeout) {
      clearTimeout(this.watchdogATimeout);
      this.watchdogATimeout = null;
    }
  }

  private clearWatchdogB(): void {
    if (this.watchdogBTimeout) {
      clearTimeout(this.watchdogBTimeout);
      this.watchdogBTimeout = null;
    }
  }

  private clearWatchdogC(): void {
    if (this.watchdogCTimeout) {
      clearTimeout(this.watchdogCTimeout);
      this.watchdogCTimeout = null;
    }
  }

  private clearWatchdogs(): void {
    this.clearWatchdogA();
    this.clearWatchdogB();
    this.clearWatchdogC();
  }

  private async handleWatchdogATriggered(): Promise<void> {
    console.warn(
      `[StudySessionService] Watchdog A activado: TURN_ACK_TIMEOUT tras ${this.watchdogTimeouts.ackTimeoutMs}ms sin reconocimiento del servidor`,
    );
    this.clearWatchdogs();

    const turn = this.currentTurn;
    const retryChunks =
      turn &&
      turn.retryCount === 0 &&
      !turn.serverAcknowledgedInput &&
      this.currentUserAudioChunks.length > 0
        ? [...this.currentUserAudioChunks]
        : undefined;

    if (turn) {
      turn.retryCount += 1;
    }

    const ackError = createAppError(
      "TURN_ACK_TIMEOUT",
      "El servidor no confirmó la recepción del audio del usuario.",
      "Reconectando sesión...",
      true,
    );

    await this.handleProviderError(ackError, retryChunks);
  }

  private async handleWatchdogBTriggered(): Promise<void> {
    console.warn(
      `[StudySessionService] Watchdog B activado: MODEL_START_TIMEOUT tras ${this.watchdogTimeouts.startTimeoutMs}ms sin salida del modelo`,
    );
    this.clearWatchdogs();

    const startError = createAppError(
      "MODEL_START_TIMEOUT",
      "El modelo tardó demasiado en comenzar a responder.",
      "Reconectando sesión...",
      true,
    );

    await this.handleProviderError(startError);
  }

  private async handleWatchdogCTriggered(): Promise<void> {
    console.warn(
      `[StudySessionService] Watchdog C activado: MODEL_STALLED_TIMEOUT tras ${this.watchdogTimeouts.stalledTimeoutMs}ms sin eventos durante la respuesta`,
    );
    this.clearWatchdogs();
    this.flushModelMessage();

    const stalledError = createAppError(
      "MODEL_STALLED_TIMEOUT",
      "La respuesta del modelo se interrumpió y no continuó.",
      "Reconectando sesión...",
      true,
    );

    await this.handleProviderError(stalledError);
  }

  private flushUserAudioMessage(explicitText?: string): void {
    if (!this.currentChatId || !this.chatStore) {
      this.currentUserAudioChunks = [];
      this.currentUserAudioBytes = 0;
      this.currentUserTranscription = "";
      return;
    }

    const hasExplicitText = explicitText !== undefined && explicitText.trim().length > 0;

    if (hasExplicitText) {
      // User sent text manually via text input.
      // Explicitly discard ambient mic chunks so no phantom audio is attached to text.
      const text = explicitText.trim();
      this.currentUserAudioChunks = [];
      this.currentUserAudioBytes = 0;
      this.currentUserTranscription = "";

      const optimisticMsg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: "user",
        text,
        timestamp: Date.now(),
      };

      for (const listener of this.messageCompleteListeners) {
        listener(optimisticMsg);
      }

      this.chatStore
        .addMessage(this.currentChatId, {
          role: "user",
          text,
        })
        .catch(() => {});
      return;
    }

    // Voice turn:
    // Only create a user message if there is actual transcribed speech text from the user.
    const text = this.currentUserTranscription.trim();
    this.currentUserTranscription = "";

    if (!text) {
      // No transcribed speech text: discard accumulated ambient background audio chunks
      this.currentUserAudioChunks = [];
      this.currentUserAudioBytes = 0;
      return;
    }

    const hasAudio = this.currentUserAudioChunks.length > 0;
    const mergedAudio = hasAudio ? mergeUint8Arrays(this.currentUserAudioChunks) : undefined;
    this.currentUserAudioChunks = [];
    this.currentUserAudioBytes = 0;

    // Ensure audio has valid duration (at least 200ms -> 6400 bytes at 16kHz PCM16)
    const isValidAudio = Boolean(mergedAudio && mergedAudio.byteLength >= 3200);
    const audioDurationMs =
      isValidAudio && mergedAudio
        ? Math.round((mergedAudio.byteLength / 2 / 16000) * 1000)
        : undefined;

    const audioBase64 =
      isValidAudio && mergedAudio
        ? `data:audio/wav;base64,${WavEncoder.encodePcm16(mergedAudio, 16000).toString("base64")}`
        : undefined;

    const optimisticMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      text,
      audioBase64,
      audioDurationMs,
      timestamp: Date.now(),
    };

    for (const listener of this.messageCompleteListeners) {
      listener(optimisticMsg);
    }

    this.chatStore
      .addMessage(
        this.currentChatId,
        {
          role: "user",
          text,
        },
        isValidAudio && mergedAudio ? { bytes: mergedAudio, sampleRate: 16000 } : undefined,
      )
      .catch(() => {});
  }

  private flushModelMessage(): void {
    if (!this.currentChatId || !this.chatStore) {
      this.currentModelText = "";
      this.currentModelAudioChunks = [];
      return;
    }

    const text = this.currentModelText.trim();
    this.currentModelText = "";

    const hasAudio = this.currentModelAudioChunks.length > 0;
    const mergedAudio = hasAudio ? mergeUint8Arrays(this.currentModelAudioChunks) : undefined;
    this.currentModelAudioChunks = [];

    const isValidAudio = Boolean(mergedAudio && mergedAudio.byteLength >= 2400);

    if (!text && !isValidAudio) {
      return;
    }

    const audioDurationMs =
      isValidAudio && mergedAudio
        ? Math.round((mergedAudio.byteLength / 2 / 24000) * 1000)
        : undefined;

    const audioBase64 =
      isValidAudio && mergedAudio
        ? `data:audio/wav;base64,${WavEncoder.encodePcm16(mergedAudio, 24000).toString("base64")}`
        : undefined;

    const optimisticMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "model",
      text,
      audioBase64,
      audioDurationMs,
      timestamp: Date.now(),
    };

    for (const listener of this.messageCompleteListeners) {
      listener(optimisticMsg);
    }

    this.chatStore
      .addMessage(
        this.currentChatId,
        {
          role: "model",
          text,
        },
        isValidAudio && mergedAudio ? { bytes: mergedAudio, sampleRate: 24000 } : undefined,
      )
      .catch(() => {});
  }

  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  getState(): SessionState {
    return this.state;
  }

  private setState(state: SessionState): void {
    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  onState(listener: (state: SessionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  onAudioChunk(listener: (chunk: Uint8Array) => void): () => void {
    this.audioListeners.add(listener);
    return () => this.audioListeners.delete(listener);
  }

  onTextDelta(listener: (delta: string) => void): () => void {
    this.textDeltaListeners.add(listener);
    return () => this.textDeltaListeners.delete(listener);
  }

  onMessageComplete(listener: (message: ChatMessage) => void): () => void {
    this.messageCompleteListeners.add(listener);
    return () => this.messageCompleteListeners.delete(listener);
  }

  onInterrupted(listener: () => void): () => void {
    this.interruptedListeners.add(listener);
    return () => this.interruptedListeners.delete(listener);
  }

  private activeConnectConfig: {
    tutorPrompt: string;
    studyMaterial: string;
    voice: string;
    thinkingLevel?: "minimal" | "low" | "medium" | "high";
    conversationHistory: Array<{ role: "user" | "model"; text: string }>;
    responseModality?: "AUDIO" | "TEXT";
  } | null = null;

  async start(
    chatId?: string,
    options?: { includeHistory?: boolean },
  ): Promise<Result<void, AppError>> {
    if (
      this.state.status === "connecting" ||
      this.state.status === "listening" ||
      this.state.status === "speaking"
    ) {
      return ok(undefined);
    }

    this.reconnectAttempt = 0;
    this.isAwaitingTextResponse = false;
    this.clearReconnectTimeout();

    const apiKey = await this.secretStore.getGeminiApiKey();
    if (!apiKey || apiKey.trim() === "") {
      const authError = createAppError(
        "AUTH_MISSING",
        "No se ha configurado ninguna API key de Gemini.",
        "Ve a Configuración para introducir tu API key de Google Gemini.",
        false,
      );
      this.setState({ status: "error", error: authError });
      return err(authError);
    }

    this.setState({ status: "connecting" });

    let tutorPrompt = await this.dataStore.loadTutorPrompt();
    let studyMaterial = "";
    const settings = await this.dataStore.loadSettings();
    const shouldIncludeHistory =
      options?.includeHistory !== undefined
        ? options.includeHistory
        : (settings.startWithContext ?? true);
    let conversationHistory: Array<{ role: "user" | "model"; text: string }> = [];

    // Prepare or load Chat
    if (chatId && this.chatStore) {
      this.currentChatId = chatId;
      const existingChat = await this.chatStore.getChat(chatId);
      if (existingChat) {
        if (existingChat.tutorPrompt) tutorPrompt = existingChat.tutorPrompt;
        studyMaterial = existingChat.studyMaterial || "";

        // Include previous messages if requested by options or startWithContext setting
        if (shouldIncludeHistory && existingChat.messages.length > 0) {
          conversationHistory = existingChat.messages
            .filter((m) => Boolean(m.text?.trim()))
            .map((m) => ({
              role: m.role,
              text: m.text.trim(),
            }));
        }
      }
    } else if (this.chatStore) {
      const newChat = await this.chatStore.createChat({
        tutorPrompt,
        studyMaterial: "",
        voice: settings.voice,
      });
      this.currentChatId = newChat.id;
      studyMaterial = "";
    }

    this.activeConnectConfig = {
      tutorPrompt,
      studyMaterial,
      voice: settings.voice,
      thinkingLevel: settings.thinkingLevel,
      conversationHistory,
      responseModality: settings.responseModality,
    };

    const connectRes = await this.provider.connect({
      apiKey,
      tutorPrompt,
      studyMaterial,
      voice: settings.voice,
      thinkingLevel: settings.thinkingLevel,
      conversationHistory,
      responseModality: settings.responseModality,
    });

    if (isErr(connectRes)) {
      this.setState({ status: "error", error: connectRes.error });
      return connectRes;
    }

    this.setState({ status: "listening", startedAt: Date.now() });
    return ok(undefined);
  }

  private async handleProviderError(
    error: AppError,
    retryAudioChunks?: Uint8Array[],
  ): Promise<void> {
    this.clearWatchdogs();
    if (this.state.status === "idle" || this.state.status === "stopping") {
      return;
    }

    if (this.recoveryPolicy.shouldRetry(error, this.reconnectAttempt + 1)) {
      this.reconnectAttempt += 1;
      this.setState({
        status: "reconnecting",
        attempt: this.reconnectAttempt,
        maxAttempts: this.recoveryPolicy.maxAttempts,
      });

      const delay = this.recoveryPolicy.getBackoffDelay(this.reconnectAttempt);
      this.clearReconnectTimeout();

      this.reconnectTimeout = setTimeout(async () => {
        const apiKey = await this.secretStore.getGeminiApiKey();
        if (!apiKey) {
          this.setState({ status: "error", error });
          return;
        }

        const config = this.activeConnectConfig || {
          tutorPrompt: await this.dataStore.loadTutorPrompt(),
          studyMaterial: await this.dataStore.loadStudyMaterial(),
          voice: (await this.dataStore.loadSettings()).voice,
          thinkingLevel: (await this.dataStore.loadSettings()).thinkingLevel,
          responseModality: (await this.dataStore.loadSettings()).responseModality,
          conversationHistory: [],
        };

        const retryRes = await this.provider.connect({
          apiKey,
          tutorPrompt: config.tutorPrompt,
          studyMaterial: config.studyMaterial,
          voice: config.voice,
          thinkingLevel: config.thinkingLevel,
          conversationHistory: config.conversationHistory,
          responseModality: config.responseModality,
        });

        if (isErr(retryRes)) {
          await this.handleProviderError(retryRes.error);
        } else {
          this.setState({ status: "listening", startedAt: Date.now() });

          // If we have unacknowledged audio from the previous turn, replay once
          if (retryAudioChunks && retryAudioChunks.length > 0) {
            for (const chunk of retryAudioChunks) {
              this.provider.sendAudio(chunk);
            }
            this.provider.endAudioStream();
            this.startWatchdogA();
          }
        }
      }, delay);
    } else {
      this.clearReconnectTimeout();
      this.setState({ status: "error", error });
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  sendAudio(chunk: Uint8Array): void {
    if (this.isMuted || this.isAwaitingTextResponse) return;
    if (this.state.status === "listening" || this.state.status === "speaking") {
      // Only accumulate user speech chunks during listening mode, not while AI is speaking
      if (this.state.status === "listening") {
        this.currentUserAudioChunks.push(chunk);
        this.currentUserAudioBytes += chunk.byteLength;

        // Bounded buffer: max 30s (~960,000 bytes at 16kHz PCM16)
        while (
          this.currentUserAudioBytes > MAX_USER_AUDIO_BYTES &&
          this.currentUserAudioChunks.length > 1
        ) {
          const removed = this.currentUserAudioChunks.shift();
          if (removed) {
            this.currentUserAudioBytes -= removed.byteLength;
          }
        }
      }
      this.provider.sendAudio(chunk);
    }
  }

  sendText(text: string): Result<void, AppError> {
    const trimmed = text.trim();
    if (!trimmed) {
      return err(createAppError("UNKNOWN", "El mensaje de texto no puede estar vacío"));
    }

    if (this.state.status !== "listening" && this.state.status !== "speaking") {
      return err(
        createAppError("UNKNOWN", "No se puede enviar texto cuando la sesión no está activa"),
      );
    }

    this.isAwaitingTextResponse = true;
    this.flushUserAudioMessage(trimmed);
    this.provider.sendText(trimmed);
    return ok(undefined);
  }

  mute(muted: boolean): Result<void, AppError> {
    this.isMuted = muted;
    if (muted) {
      this.clearWatchdogs();
      this.provider.endAudioStream();
    }
    return ok(undefined);
  }

  async stop(): Promise<Result<void, AppError>> {
    this.clearWatchdogs();
    this.currentTurn = null;
    this.clearReconnectTimeout();
    this.isAwaitingTextResponse = false;
    this.setState({ status: "stopping" });
    await this.flushModelMessage();
    await this.flushUserAudioMessage();
    await this.provider.close();
    this.setState({ status: "idle" });
    return ok(undefined);
  }
}
