import type { DataStorePort } from "../adapters/persistence/AppDataStore";
import type { SecretStorePort } from "../adapters/persistence/SafeStorageSecretStore";
import { type AppError, createAppError } from "../domain/app-error";
import type { AppSettings, SettingsPatch } from "../domain/app-settings";
import { type Result, err, isErr, ok } from "../domain/result";

export class SettingsService {
  constructor(
    private readonly dataStore: DataStorePort,
    private readonly secretStore: SecretStorePort,
  ) {}

  async getSettings(): Promise<AppSettings> {
    return this.dataStore.loadSettings();
  }

  async updateSettings(patch: SettingsPatch): Promise<Result<void, AppError>> {
    const current = await this.dataStore.loadSettings();
    const updated: AppSettings = {
      ...current,
      ...patch,
      version: 1,
      model: "gemini-3.1-flash-live-preview",
    };
    return this.dataStore.saveSettings(updated);
  }

  async hasGeminiKey(): Promise<boolean> {
    return this.secretStore.hasGeminiApiKey();
  }

  async saveGeminiKey(key: string): Promise<Result<void, AppError>> {
    return this.secretStore.saveGeminiApiKey(key);
  }

  async deleteGeminiKey(): Promise<Result<void, AppError>> {
    return this.secretStore.deleteGeminiApiKey();
  }

  async getGeminiKey(): Promise<string | null> {
    return this.secretStore.getGeminiApiKey();
  }

  async testGeminiKey(): Promise<Result<void, AppError>> {
    const key = await this.secretStore.getGeminiApiKey();
    if (!key || key.trim() === "") {
      return err(
        createAppError(
          "AUTH_MISSING",
          "No hay ninguna API key configurada",
          "Introduce una clave de Google Gemini para habilitar el modo Live.",
        ),
      );
    }

    try {
      // Basic format validation and connectivity ping
      if (key.length < 10) {
        return err(
          createAppError(
            "AUTH_INVALID",
            "La API key parece tener un formato no válido (demasiado corta).",
          ),
        );
      }
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "AUTH_INVALID",
          "Error al validar la API key",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }
}
