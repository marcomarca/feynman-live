export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export type FallbackProviderId = "google-ai-studio" | "chatgpt";

export type ResponseModality = "AUDIO" | "TEXT";

export interface AppSettings {
  readonly version: 1;
  readonly model: "gemini-3.1-flash-live-preview";
  readonly voice: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly responseModality: ResponseModality;
  readonly globalShortcut: string;
  readonly launchAtLogin: boolean;
  readonly preferredFallbackProvider: FallbackProviderId;
  readonly inputDeviceId?: string;
  readonly outputDeviceId?: string;
  readonly defaultPromptVersion: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 1,
  model: "gemini-3.1-flash-live-preview",
  voice: "Zephyr",
  thinkingLevel: "minimal",
  responseModality: "AUDIO",
  globalShortcut: "CommandOrControl+Shift+Space",
  launchAtLogin: false,
  preferredFallbackProvider: "google-ai-studio",
  defaultPromptVersion: 1,
};

export type SettingsPatch = Partial<Omit<AppSettings, "version" | "model">>;
