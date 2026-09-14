import type { AppError } from "../domain/app-error";
import type { AppSettings, FallbackProviderId, SettingsPatch } from "../domain/app-settings";
import type { Result } from "../domain/result";
import type { SessionState } from "../domain/session-state";

export const IPC_CHANNELS = {
  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_UPDATE: "settings:update",

  // Secrets
  SECRETS_HAS_KEY: "secrets:hasKey",
  SECRETS_SAVE_KEY: "secrets:saveKey",
  SECRETS_DELETE_KEY: "secrets:deleteKey",
  SECRETS_TEST_KEY: "secrets:testKey",

  // Content
  CONTENT_LOAD_PROMPT: "content:loadPrompt",
  CONTENT_SAVE_PROMPT: "content:savePrompt",
  CONTENT_RESTORE_PROMPT: "content:restorePrompt",
  CONTENT_LOAD_MATERIAL: "content:loadMaterial",
  CONTENT_SAVE_MATERIAL: "content:saveMaterial",
  CONTENT_COMPILE_FALLBACK: "content:compileFallback",
  CONTENT_COPY_FALLBACK: "content:copyFallback",
  CONTENT_EXPORT_FALLBACK: "content:exportFallback",

  // Providers
  PROVIDERS_OPEN: "providers:open",
  PROVIDERS_COPY_AND_OPEN: "providers:copyAndOpen",

  // Session & Audio
  SESSION_START: "session:start",
  SESSION_SEND_TEXT: "session:sendText",
  SESSION_MUTE: "session:mute",
  SESSION_STOP: "session:stop",
  SESSION_AUDIO_IN: "session:audioIn", // Renderer -> Main (PCM16 16kHz)
  SESSION_AUDIO_OUT: "session:audioOut", // Main -> Renderer (PCM16 24kHz)
  SESSION_INTERRUPTED: "session:interrupted", // Main -> Renderer (clear audio queue)
  SESSION_STATE_CHANGED: "session:stateChanged", // Main -> Renderer

  // Window
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_HIDE: "window:hide",
} as const;

export interface FeynmanDesktopApi {
  readonly settings: {
    get(): Promise<AppSettings>;
    update(patch: SettingsPatch): Promise<Result<void, AppError>>;
  };

  readonly secrets: {
    hasGeminiKey(): Promise<boolean>;
    saveGeminiKey(value: string): Promise<Result<void, AppError>>;
    deleteGeminiKey(): Promise<Result<void, AppError>>;
    testGeminiKey(): Promise<Result<void, AppError>>;
  };

  readonly content: {
    loadTutorPrompt(): Promise<string>;
    saveTutorPrompt(value: string): Promise<Result<void, AppError>>;
    restoreTutorPrompt(): Promise<string>;

    loadStudyMaterial(): Promise<string>;
    saveStudyMaterial(value: string): Promise<Result<void, AppError>>;

    compilePortablePrompt(): Promise<string>;
    copyPortablePrompt(): Promise<Result<void, AppError>>;
    exportPortablePrompt(): Promise<Result<{ path: string }, AppError>>;
  };

  readonly session: {
    start(): Promise<Result<void, AppError>>;
    sendText(value: string): Promise<Result<void, AppError>>;
    mute(value: boolean): Promise<Result<void, AppError>>;
    stop(): Promise<Result<void, AppError>>;
    sendAudioChunk(chunk: Uint8Array): void;
    onAudioChunk(listener: (chunk: Uint8Array) => void): () => void;
    onInterrupted(listener: () => void): () => void;
    onState(listener: (state: SessionState) => void): () => void;
  };

  readonly providers: {
    open(provider: FallbackProviderId): Promise<Result<void, AppError>>;
    copyAndOpen(provider: FallbackProviderId): Promise<Result<void, AppError>>;
  };

  readonly window: {
    minimize(): void;
    hide(): void;
  };
}
