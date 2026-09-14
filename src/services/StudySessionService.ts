import type { LiveTutorProvider } from "../adapters/gemini/GeminiLiveAdapter";
import type { SessionRecoveryPolicy } from "../adapters/gemini/GeminiSessionRecovery";
import { DefaultSessionRecoveryPolicy } from "../adapters/gemini/GeminiSessionRecovery";
import type { DataStorePort } from "../adapters/persistence/AppDataStore";
import type { SecretStorePort } from "../adapters/persistence/SafeStorageSecretStore";
import { type AppError, createAppError } from "../domain/app-error";
import { type Result, err, isErr, ok } from "../domain/result";
import type { SessionState } from "../domain/session-state";

export class StudySessionService {
  private state: SessionState = { status: "idle" };
  private stateListeners: Set<(state: SessionState) => void> = new Set();
  private audioListeners: Set<(chunk: Uint8Array) => void> = new Set();
  private interruptedListeners: Set<() => void> = new Set();

  private reconnectAttempt = 0;
  private isMuted = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dataStore: DataStorePort,
    private readonly secretStore: SecretStorePort,
    private readonly provider: LiveTutorProvider,
    private readonly recoveryPolicy: SessionRecoveryPolicy = new DefaultSessionRecoveryPolicy(),
  ) {
    this.setupProviderListeners();
  }

  private setupProviderListeners(): void {
    this.provider.onAudioChunk((chunk) => {
      if (this.state.status === "listening" || this.state.status === "speaking") {
        if (this.state.status !== "speaking") {
          this.setState({ status: "speaking", startedAt: Date.now() });
        }
        for (const listener of this.audioListeners) {
          listener(chunk);
        }
      }
    });

    this.provider.onInterrupted(() => {
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

  onInterrupted(listener: () => void): () => void {
    this.interruptedListeners.add(listener);
    return () => this.interruptedListeners.delete(listener);
  }

  async start(): Promise<Result<void, AppError>> {
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

    const tutorPrompt = await this.dataStore.loadTutorPrompt();
    const studyMaterial = await this.dataStore.loadStudyMaterial();
    const settings = await this.dataStore.loadSettings();

    const connectRes = await this.provider.connect({
      apiKey,
      tutorPrompt,
      studyMaterial,
      voice: settings.voice,
      thinkingLevel: settings.thinkingLevel,
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

        const tutorPrompt = await this.dataStore.loadTutorPrompt();
        const studyMaterial = await this.dataStore.loadStudyMaterial();
        const settings = await this.dataStore.loadSettings();

        const retryRes = await this.provider.connect({
          apiKey,
          tutorPrompt,
          studyMaterial,
          voice: settings.voice,
          thinkingLevel: settings.thinkingLevel,
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
    await this.provider.close();
    this.setState({ status: "idle" });
    return ok(undefined);
  }
}
