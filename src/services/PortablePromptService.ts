import type { ClipboardPort } from "../adapters/desktop/ClipboardAdapter";
import type { DataStorePort } from "../adapters/persistence/AppDataStore";
import { type AppError, createAppError } from "../domain/app-error";
import { type Result, err, isErr, ok } from "../domain/result";
import type { PortablePromptCompiler } from "./PortablePromptCompiler";

export interface PortablePromptServicePort {
  compilePrompt(): Promise<string>;
  copyPrompt(): Promise<Result<void, AppError>>;
  exportToFile(filePath: string): Promise<Result<void, AppError>>;
}

export class PortablePromptService implements PortablePromptServicePort {
  constructor(
    private readonly dataStore: DataStorePort,
    private readonly compiler: PortablePromptCompiler,
    private readonly clipboard: ClipboardPort,
  ) {}

  async compilePrompt(): Promise<string> {
    const tutorPrompt = await this.dataStore.loadTutorPrompt();
    const studyMaterial = await this.dataStore.loadStudyMaterial();
    return this.compiler.compile({ tutorPrompt, studyMaterial });
  }

  async copyPrompt(): Promise<Result<void, AppError>> {
    const compiled = await this.compilePrompt();
    return this.clipboard.writeText(compiled);
  }

  async exportToFile(filePath: string): Promise<Result<void, AppError>> {
    if (!filePath || filePath.trim() === "") {
      return err(createAppError("UNKNOWN", "Ruta de archivo no válida para exportación"));
    }
    const compiled = await this.compilePrompt();
    return this.dataStore.exportToFile(filePath, compiled);
  }
}
