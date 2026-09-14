import { type AppError, createAppError } from "../../domain/app-error";
import { type Result, err, ok } from "../../domain/result";

export interface ClipboardProvider {
  writeText: (text: string) => void;
  readText: () => string;
}

export interface ClipboardPort {
  writeText(text: string): Promise<Result<void, AppError>>;
  readText(): Promise<Result<string, AppError>>;
}

export class ElectronClipboardAdapter implements ClipboardPort {
  private memoryBuffer = "";

  constructor(private readonly clipboard?: ClipboardProvider) {}

  async writeText(text: string): Promise<Result<void, AppError>> {
    try {
      if (this.clipboard && typeof this.clipboard.writeText === "function") {
        this.clipboard.writeText(text);
      } else {
        this.memoryBuffer = text;
      }
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo copiar al portapapeles",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async readText(): Promise<Result<string, AppError>> {
    try {
      if (this.clipboard && typeof this.clipboard.readText === "function") {
        return ok(this.clipboard.readText());
      }
      return ok(this.memoryBuffer);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo leer del portapapeles",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }
}
