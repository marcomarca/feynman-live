import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AppError, createAppError } from "../../domain/app-error";
import type { AppSettings } from "../../domain/app-settings";
import { DEFAULT_APP_SETTINGS } from "../../domain/app-settings";
import { type Result, err, ok } from "../../domain/result";
import {
  APP_DATA_SUBDIR,
  DEFAULT_TUTOR_PROMPT,
  SETTINGS_FILE_NAME,
  STUDY_MATERIAL_FILE_NAME,
  TUTOR_PROMPT_FILE_NAME,
} from "../../shared/constants";

export interface DataStorePort {
  loadTutorPrompt(): Promise<string>;
  saveTutorPrompt(content: string): Promise<Result<void, AppError>>;
  restoreDefaultTutorPrompt(): Promise<string>;

  loadStudyMaterial(): Promise<string>;
  saveStudyMaterial(content: string): Promise<Result<void, AppError>>;

  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<Result<void, AppError>>;

  exportToFile(filePath: string, content: string): Promise<Result<void, AppError>>;
}

export class AppDataStore implements DataStorePort {
  private readonly appDataDir: string;
  private initialized = false;

  constructor(baseUserDataPath: string) {
    this.appDataDir = join(baseUserDataPath, APP_DATA_SUBDIR);
  }

  get directoryPath(): string {
    return this.appDataDir;
  }

  private async ensureDir(): Promise<void> {
    if (!this.initialized) {
      if (!existsSync(this.appDataDir)) {
        await mkdir(this.appDataDir, { recursive: true });
      }
      this.initialized = true;
    }
  }

  private async writeAtomic(filePath: string, content: string): Promise<void> {
    await this.ensureDir();
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await writeFile(tempPath, content, "utf-8");
      await rename(tempPath, filePath);
    } catch (e) {
      try {
        if (existsSync(tempPath)) {
          await unlink(tempPath);
        }
      } catch {
        // ignore clean up error
      }
      throw e;
    }
  }

  async loadTutorPrompt(): Promise<string> {
    await this.ensureDir();
    const filePath = join(this.appDataDir, TUTOR_PROMPT_FILE_NAME);
    if (!existsSync(filePath)) {
      await this.saveTutorPrompt(DEFAULT_TUTOR_PROMPT);
      return DEFAULT_TUTOR_PROMPT;
    }
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return DEFAULT_TUTOR_PROMPT;
    }
  }

  async saveTutorPrompt(content: string): Promise<Result<void, AppError>> {
    try {
      const filePath = join(this.appDataDir, TUTOR_PROMPT_FILE_NAME);
      await this.writeAtomic(filePath, content);
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo guardar el prompt del tutor",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async restoreDefaultTutorPrompt(): Promise<string> {
    await this.saveTutorPrompt(DEFAULT_TUTOR_PROMPT);
    return DEFAULT_TUTOR_PROMPT;
  }

  async loadStudyMaterial(): Promise<string> {
    await this.ensureDir();
    const filePath = join(this.appDataDir, STUDY_MATERIAL_FILE_NAME);
    if (!existsSync(filePath)) {
      return "";
    }
    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  async saveStudyMaterial(content: string): Promise<Result<void, AppError>> {
    try {
      const filePath = join(this.appDataDir, STUDY_MATERIAL_FILE_NAME);
      await this.writeAtomic(filePath, content);
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo guardar el material de estudio",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async loadSettings(): Promise<AppSettings> {
    await this.ensureDir();
    const filePath = join(this.appDataDir, SETTINGS_FILE_NAME);
    if (!existsSync(filePath)) {
      await this.saveSettings(DEFAULT_APP_SETTINGS);
      return DEFAULT_APP_SETTINGS;
    }
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
        version: 1,
        model: "gemini-3.1-flash-live-preview",
      };
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  }

  async saveSettings(settings: AppSettings): Promise<Result<void, AppError>> {
    try {
      const filePath = join(this.appDataDir, SETTINGS_FILE_NAME);
      await this.writeAtomic(filePath, JSON.stringify(settings, null, 2));
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo guardar la configuración",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async exportToFile(filePath: string, content: string): Promise<Result<void, AppError>> {
    try {
      await writeFile(filePath, content, "utf-8");
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo exportar el archivo",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }
}
