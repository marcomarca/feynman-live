import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AppError, createAppError } from "../../domain/app-error";
import { type Result, err, ok } from "../../domain/result";
import { API_KEY_FILE_NAME, APP_DATA_SUBDIR, SECRETS_DIR_NAME } from "../../shared/constants";

export interface SafeStorageProvider {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
}

export interface SecretStorePort {
  hasGeminiApiKey(): Promise<boolean>;
  saveGeminiApiKey(key: string): Promise<Result<void, AppError>>;
  deleteGeminiApiKey(): Promise<Result<void, AppError>>;
  getGeminiApiKey(): Promise<string | null>;
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

function updateEnvContent(existingContent: string, keyToSet: string, valueToSet: string): string {
  const lines = existingContent.split(/\r?\n/);
  let found = false;
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (key === keyToSet) {
        found = true;
        return `${keyToSet}=${valueToSet}`;
      }
    }
    return line;
  });

  if (!found) {
    if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== "") {
      newLines.push("");
    }
    newLines.push(`${keyToSet}=${valueToSet}`);
  }
  return newLines.join("\n");
}

export class SafeStorageSecretStore implements SecretStorePort {
  private readonly secretsDir: string;
  private readonly keyFilePath: string;
  private readonly envFilePath: string;

  constructor(
    baseUserDataPath: string,
    private readonly safeStorage?: SafeStorageProvider,
    envFilePath?: string,
  ) {
    this.secretsDir = join(baseUserDataPath, APP_DATA_SUBDIR, SECRETS_DIR_NAME);
    this.keyFilePath = join(this.secretsDir, API_KEY_FILE_NAME);
    this.envFilePath = envFilePath ?? join(baseUserDataPath, ".env");
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.secretsDir)) {
      await mkdir(this.secretsDir, { recursive: true });
    }
  }

  async hasGeminiApiKey(): Promise<boolean> {
    const key = await this.getGeminiApiKey();
    return key !== null && key.trim() !== "";
  }

  async saveGeminiApiKey(key: string): Promise<Result<void, AppError>> {
    const trimmed = key.trim();
    if (!trimmed) {
      return this.deleteGeminiApiKey();
    }

    try {
      await this.ensureDir();
      let encryptedBuffer: Buffer;

      if (this.safeStorage?.isEncryptionAvailable()) {
        encryptedBuffer = this.safeStorage.encryptString(trimmed);
      } else {
        // Fallback for test / environments without DPAPI safeStorage
        encryptedBuffer = Buffer.from(`__MOCK_ENC__:${Buffer.from(trimmed).toString("base64")}`);
      }

      await writeFile(this.keyFilePath, encryptedBuffer);

      // Also persist to .env file for automatic workspace key sync
      try {
        let envContent = "";
        if (existsSync(this.envFilePath)) {
          envContent = await readFile(this.envFilePath, "utf-8");
        }
        const updatedEnv = updateEnvContent(envContent, "GEMINI_API_KEY", trimmed);
        await writeFile(this.envFilePath, updatedEnv, "utf-8");
      } catch {
        // Non-blocking if .env is locked or not writable
      }

      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "AUTH_INVALID",
          "No se pudo cifrar y guardar la API Key",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async deleteGeminiApiKey(): Promise<Result<void, AppError>> {
    try {
      if (existsSync(this.keyFilePath)) {
        await unlink(this.keyFilePath);
      }

      if (existsSync(this.envFilePath)) {
        try {
          const envContent = await readFile(this.envFilePath, "utf-8");
          const updatedEnv = updateEnvContent(envContent, "GEMINI_API_KEY", "");
          await writeFile(this.envFilePath, updatedEnv, "utf-8");
        } catch {
          // ignore
        }
      }

      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "No se pudo eliminar la API Key",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async getGeminiApiKey(): Promise<string | null> {
    // 1. Try reading encrypted DPAPI file first
    try {
      if (existsSync(this.keyFilePath)) {
        const buffer = await readFile(this.keyFilePath);

        if (this.safeStorage?.isEncryptionAvailable()) {
          try {
            const decrypted = this.safeStorage.decryptString(buffer);
            if (decrypted && decrypted.trim() !== "") {
              return decrypted.trim();
            }
          } catch {
            const str = buffer.toString("utf-8");
            if (str.startsWith("__MOCK_ENC__:")) {
              const decoded = Buffer.from(str.slice("__MOCK_ENC__:".length), "base64").toString(
                "utf-8",
              );
              if (decoded && decoded.trim() !== "") return decoded.trim();
            }
          }
        } else {
          const str = buffer.toString("utf-8");
          if (str.startsWith("__MOCK_ENC__:")) {
            const decoded = Buffer.from(str.slice("__MOCK_ENC__:".length), "base64").toString(
              "utf-8",
            );
            if (decoded && decoded.trim() !== "") return decoded.trim();
          }
        }
      }
    } catch {
      // fallback to .env
    }

    // 2. Try reading from .env file
    try {
      if (existsSync(this.envFilePath)) {
        const envContent = await readFile(this.envFilePath, "utf-8");
        const parsed = parseEnvFile(envContent);
        const envKey = parsed.GEMINI_API_KEY || parsed.GOOGLE_API_KEY;
        if (envKey && envKey.trim() !== "") {
          return envKey.trim();
        }
      }
    } catch {
      // no key found
    }

    return null;
  }
}
