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

  private reconnectAttempt = 0;
  private isMuted = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dataStore: DataStorePort,
    private readonly secretStore: SecretStorePort,
    private readonly provider: LiveTutorProvider,
    private readonly chatStore?: ChatStorePort,
    private readonly recoveryPolicy: SessionRecoveryPolicy = new DefaultSessionRecoveryPolicy(),
  ) {
    this.setupProviderListeners();
  }

  private setupProviderListeners(): void {
    this.provider.onAudioChunk((chunk) => {
      if (this.state.status === "listening" || this.state.status === "speaking") {
        if (this.state.status !== "speaking") {
          // If user had pending voice chunks, save the user message now
          this.flushUserAudioMessage();
          this.setState({ status: "speaking", startedAt: Date.now() });
        }
        this.currentModelAudioChunks.push(chunk);
        for (const listener of this.audioListeners) {
          listener(chunk);
        }
      }
    });

    this.provider.onTextDelta((delta) => {
      this.currentModelText += delta;
      for (const listener of this.textDeltaListeners) {
        listener(delta);
      }
    });

    this.provider.onUserTranscription((text) => {
      this.currentUserTranscription += (this.currentUserTranscription ? " " : "") + text;
    });

    this.provider.onTurnComplete(() => {
      this.flushModelMessage();
      if (this.state.status === "speaking") {
        this.setState({ status: "listening", startedAt: Date.now() });
      }
    });

    this.provider.onInterrupted(() => {
      this.flushModelMessage();
      for (const listener of this.interruptedListeners) {
        listener();
      }
      if (this.state.status === "speaking") {
        this.setState({ status: "listening", startedAt: Date.now() });
      }
    });

    this.provider.onError(async (error) => {
      await this.handleProviderError(error);
    });

    this.provider.onClose(async () => {
      if (this.state.status !== "idle" && this.state.status !== "stopping") {
        await this.handleProviderError(
          createAppError("CONNECTION_CLOSED", "Conexión cerrada", undefined, true),
        );
      }
    });
  }

  private flushUserAudioMessage(explicitText?: string): void {
    if (!this.currentChatId || !this.chatStore) {
      this.currentUserAudioChunks = [];
      this.currentUserTranscription = "";
      return;
    }

    const hasAudio = this.currentUserAudioChunks.length > 0;
    const text = explicitText ? explicitText.trim() : this.currentUserTranscription.trim();
    this.currentUserTranscription = "";

    const hasText = Boolean(text);

    if (!hasAudio && !hasText) return;

    const mergedAudio = hasAudio ? mergeUint8Arrays(this.currentUserAudioChunks) : undefined;
    this.currentUserAudioChunks = [];

    const audioBase64 = mergedAudio
      ? `data:audio/wav;base64,${WavEncoder.encodePcm16(mergedAudio, 16000).toString("base64")}`
      : undefined;

    const optimisticMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      text,
      audioBase64,
      audioDurationMs: mergedAudio
        ? Math.round((mergedAudio.byteLength / 2 / 16000) * 1000)
        : undefined,
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
        mergedAudio ? { bytes: mergedAudio, sampleRate: 16000 } : undefined,
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
    const hasAudio = this.currentModelAudioChunks.length > 0;

    if (!text && !hasAudio) return;

    const mergedAudio = hasAudio ? mergeUint8Arrays(this.currentModelAudioChunks) : undefined;
    this.currentModelText = "";
    this.currentModelAudioChunks = [];

    const audioBase64 = mergedAudio
      ? `data:audio/wav;base64,${WavEncoder.encodePcm16(mergedAudio, 24000).toString("base64")}`
      : undefined;

    const optimisticMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "model",
      text,
      audioBase64,
      audioDurationMs: mergedAudio
        ? Math.round((mergedAudio.byteLength / 2 / 24000) * 1000)
        : undefined,
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
        mergedAudio ? { bytes: mergedAudio, sampleRate: 24000 } : undefined,
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
    let studyMaterial = await this.dataStore.loadStudyMaterial();
    const settings = await this.dataStore.loadSettings();
    let conversationHistory: Array<{ role: "user" | "model"; text: string }> = [];

    // Prepare or load Chat
    if (chatId && this.chatStore) {
      this.currentChatId = chatId;
      const existingChat = await this.chatStore.getChat(chatId);
      if (existingChat) {
        if (existingChat.tutorPrompt) tutorPrompt = existingChat.tutorPrompt;
        if (existingChat.studyMaterial) studyMaterial = existingChat.studyMaterial;

        // By default, include all previous messages for seamless continuity
        if (options?.includeHistory !== false && existingChat.messages.length > 0) {
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
        studyMaterial,
        voice: settings.voice,
      });
      this.currentChatId = newChat.id;
    }

    this.activeConnectConfig = {
      tutorPrompt,
      studyMaterial,
      voice: settings.voice,
      thinkingLevel: settings.thinkingLevel,
      conversationHistory,
    };

    const connectRes = await this.provider.connect({
      apiKey,
      tutorPrompt,
      studyMaterial,
      voice: settings.voice,
      thinkingLevel: settings.thinkingLevel,
      conversationHistory,
    });

    if (isErr(connectRes)) {
      this.setState({ status: "error", error: connectRes.error });
      return connectRes;
    }

    this.setState({ status: "listening", startedAt: Date.now() });
    return ok(undefined);
  }

  private async handleProviderError(error: AppError): Promise<void> {
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
          conversationHistory: [],
        };

        const retryRes = await this.provider.connect({
          apiKey,
          tutorPrompt: config.tutorPrompt,
          studyMaterial: config.studyMaterial,
          voice: config.voice,
          thinkingLevel: config.thinkingLevel,
          conversationHistory: config.conversationHistory,
        });

        if (isErr(retryRes)) {
          await this.handleProviderError(retryRes.error);
        } else {
          this.reconnectAttempt = 0;
          this.setState({ status: "listening", startedAt: Date.now() });
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
    if (this.isMuted) return;
    if (this.state.status === "listening" || this.state.status === "speaking") {
      this.currentUserAudioChunks.push(chunk);
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

    this.flushUserAudioMessage(trimmed);
    this.provider.sendText(trimmed);
    return ok(undefined);
  }

  mute(muted: boolean): Result<void, AppError> {
    this.isMuted = muted;
    return ok(undefined);
  }

  async stop(): Promise<Result<void, AppError>> {
    this.clearReconnectTimeout();
    this.setState({ status: "stopping" });
    await this.flushModelMessage();
    await this.flushUserAudioMessage();
    await this.provider.close();
    this.setState({ status: "idle" });
    return ok(undefined);
  }
}
