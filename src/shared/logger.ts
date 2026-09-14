import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface LoggerPort {
  info(category: string, message: string, data?: unknown): void;
  warn(category: string, message: string, data?: unknown): void;
  error(category: string, message: string, data?: unknown): void;
}

export class AppLogger implements LoggerPort {
  private logFilePath: string | null = null;
  private initialized = false;

  constructor(baseUserDataPath?: string) {
    if (baseUserDataPath) {
      const logsDir = join(baseUserDataPath, "app-data", "logs");
      this.logFilePath = join(logsDir, "session.log");
    }
  }

  private async ensureLogDir(): Promise<void> {
    if (!this.initialized && this.logFilePath) {
      const dir = join(this.logFilePath, "..");
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      this.initialized = true;
    }
  }

  private formatLog(level: string, category: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    let dataStr = "";
    if (data !== undefined) {
      try {
        dataStr = ` | data: ${typeof data === "string" ? data : JSON.stringify(data)}`;
      } catch {
        dataStr = " | data: [unserializable]";
      }
    }
    return `[${timestamp}] [${level}] [${category}] ${message}${dataStr}`;
  }

  private write(level: string, category: string, message: string, data?: unknown): void {
    const formatted = this.formatLog(level, category, message, data);

    if (level === "ERROR") {
      console.error(formatted);
    } else if (level === "WARN") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    if (this.logFilePath) {
      this.ensureLogDir()
        .then(() => {
          if (this.logFilePath) {
            appendFile(this.logFilePath, `${formatted}\n`, "utf-8").catch(() => {});
          }
        })
        .catch(() => {});
    }
  }

  info(category: string, message: string, data?: unknown): void {
    this.write("INFO", category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.write("WARN", category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.write("ERROR", category, message, data);
  }
}

export const defaultLogger = new AppLogger();
