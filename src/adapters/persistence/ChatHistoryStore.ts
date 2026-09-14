import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AppError, createAppError } from "../../domain/app-error";
import type {
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
  CreateChatInput,
  UpdateChatInput,
} from "../../domain/chat";
import { type Result, err, ok } from "../../domain/result";
import { APP_DATA_SUBDIR } from "../../shared/constants";
import { WavEncoder } from "./WavEncoder";

const CHATS_SUBDIR = "chats";
const META_FILE_NAME = "session.json";
const AUDIO_SUBDIR = "audio";

export interface ChatStorePort {
  listChats(): Promise<ChatSessionMeta[]>;
  getChat(id: string): Promise<ChatSession | null>;
  createChat(input: CreateChatInput): Promise<ChatSession>;
  updateChat(id: string, input: UpdateChatInput): Promise<Result<ChatSession, AppError>>;
  deleteChat(id: string): Promise<Result<void, AppError>>;
  addMessage(
    chatId: string,
    message: Omit<ChatMessage, "id" | "timestamp">,
    pcmAudio?: { bytes: Uint8Array; sampleRate: number },
  ): Promise<Result<ChatMessage, AppError>>;
  getAudioAsBase64(chatId: string, audioFileName: string): Promise<string | null>;
  exportChatAsMarkdown(chatId: string): Promise<string>;
}

export class ChatHistoryStore implements ChatStorePort {
  private readonly chatsDir: string;
  private initialized = false;

  constructor(baseUserDataPath: string) {
    this.chatsDir = join(baseUserDataPath, APP_DATA_SUBDIR, CHATS_SUBDIR);
  }

  get directoryPath(): string {
    return this.chatsDir;
  }

  private async ensureDir(): Promise<void> {
    if (!this.initialized) {
      if (!existsSync(this.chatsDir)) {
        await mkdir(this.chatsDir, { recursive: true });
      }
      this.initialized = true;
    }
  }

  private getChatDir(chatId: string): string {
    return join(this.chatsDir, chatId);
  }

  private getMetaPath(chatId: string): string {
    return join(this.getChatDir(chatId), META_FILE_NAME);
  }

  private getAudioDir(chatId: string): string {
    return join(this.getChatDir(chatId), AUDIO_SUBDIR);
  }

  private async writeAtomic(filePath: string, content: string): Promise<void> {
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

  async listChats(): Promise<ChatSessionMeta[]> {
    await this.ensureDir();
    try {
      const entries = await readdir(this.chatsDir, { withFileTypes: true });
      const metas: ChatSessionMeta[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metaPath = join(this.chatsDir, entry.name, META_FILE_NAME);
          if (existsSync(metaPath)) {
            try {
              const raw = await readFile(metaPath, "utf-8");
              const parsed = JSON.parse(raw) as ChatSession;
              metas.push({
                id: parsed.id,
                title: parsed.title,
                createdAt: parsed.createdAt,
                updatedAt: parsed.updatedAt,
                messageCount: parsed.messages ? parsed.messages.length : 0,
                tutorPrompt: parsed.tutorPrompt || "",
                studyMaterial: parsed.studyMaterial || "",
                voice: parsed.voice || "Zephyr",
              });
            } catch {
              // ignore corrupt file
            }
          }
        }
      }

      // Sort newest first
      return metas.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async getChat(id: string): Promise<ChatSession | null> {
    await this.ensureDir();
    const metaPath = this.getMetaPath(id);
    if (!existsSync(metaPath)) {
      return null;
    }

    try {
      const raw = await readFile(metaPath, "utf-8");
      const session = JSON.parse(raw) as ChatSession;

      // Populate audioBase64 if available
      for (const msg of session.messages) {
        if (msg.audioFileName) {
          const audioPath = join(this.getAudioDir(id), msg.audioFileName);
          if (existsSync(audioPath)) {
            try {
              const audioBuf = await readFile(audioPath);
              msg.audioBase64 = `data:audio/wav;base64,${audioBuf.toString("base64")}`;
            } catch {
              // ignore missing audio buffer
            }
          }
        }
      }

      return session;
    } catch {
      return null;
    }
  }

  async createChat(input: CreateChatInput): Promise<ChatSession> {
    await this.ensureDir();
    const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const chatDir = this.getChatDir(id);
    await mkdir(chatDir, { recursive: true });
    await mkdir(this.getAudioDir(id), { recursive: true });

    const now = Date.now();
    const title =
      input.title?.trim() ||
      (input.studyMaterial
        ? input.studyMaterial.slice(0, 40).split("\n")[0].trim() || "Nueva Sesión"
        : "Nueva Sesión de Estudio");

    const session: ChatSession = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      tutorPrompt: input.tutorPrompt,
      studyMaterial: input.studyMaterial,
      voice: input.voice,
      messages: [],
    };

    await this.writeAtomic(this.getMetaPath(id), JSON.stringify(session, null, 2));
    return session;
  }

  async updateChat(id: string, input: UpdateChatInput): Promise<Result<ChatSession, AppError>> {
    const chat = await this.getChat(id);
    if (!chat) {
      return err(createAppError("UNKNOWN", `No se encontró el chat con id ${id}`));
    }

    if (input.title !== undefined) chat.title = input.title;
    if (input.tutorPrompt !== undefined) chat.tutorPrompt = input.tutorPrompt;
    if (input.studyMaterial !== undefined) chat.studyMaterial = input.studyMaterial;
    chat.updatedAt = Date.now();

    try {
      await this.writeAtomic(this.getMetaPath(id), JSON.stringify(chat, null, 2));
      return ok(chat);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "Error al actualizar el chat",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async deleteChat(id: string): Promise<Result<void, AppError>> {
    const chatDir = this.getChatDir(id);
    if (!existsSync(chatDir)) {
      return ok(undefined);
    }

    try {
      rmSync(chatDir, { recursive: true, force: true });
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          `No se pudo eliminar el chat ${id}`,
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async addMessage(
    chatId: string,
    message: Omit<ChatMessage, "id" | "timestamp">,
    pcmAudio?: { bytes: Uint8Array; sampleRate: number },
  ): Promise<Result<ChatMessage, AppError>> {
    const chat = await this.getChat(chatId);
    if (!chat) {
      return err(createAppError("UNKNOWN", `Chat no encontrado: ${chatId}`));
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    let audioFileName: string | undefined;
    let audioDurationMs: number | undefined;
    let audioBase64: string | undefined;

    if (pcmAudio && pcmAudio.bytes.byteLength > 0) {
      audioFileName = `${messageId}.wav`;
      const wavBuffer = WavEncoder.encodePcm16(pcmAudio.bytes, pcmAudio.sampleRate);
      audioDurationMs = WavEncoder.calculateDurationMs(
        pcmAudio.bytes.byteLength,
        pcmAudio.sampleRate,
      );
      audioBase64 = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;

      const audioDir = this.getAudioDir(chatId);
      await mkdir(audioDir, { recursive: true });
      await writeFile(join(audioDir, audioFileName), wavBuffer);
    }

    const newMessage: ChatMessage = {
      id: messageId,
      role: message.role,
      text: message.text,
      audioFileName,
      audioDurationMs,
      audioBase64,
      timestamp: now,
    };

    chat.messages.push(newMessage);
    chat.messageCount = chat.messages.length;
    chat.updatedAt = now;

    // Auto-update title if it was the default and user sent text
    if (chat.title === "Nueva Sesión de Estudio" && message.role === "user" && message.text) {
      chat.title = message.text.slice(0, 35).trim();
    }

    try {
      // Save metadata without audioBase64 to keep JSON small
      const toSave: ChatSession = {
        ...chat,
        messages: chat.messages.map((m) => {
          const { audioBase64: _omitted, ...rest } = m;
          return rest;
        }),
      };
      await this.writeAtomic(this.getMetaPath(chatId), JSON.stringify(toSave, null, 2));
      return ok(newMessage);
    } catch (e) {
      return err(
        createAppError(
          "UNKNOWN",
          "Error al guardar mensaje en el chat",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  async getAudioAsBase64(chatId: string, audioFileName: string): Promise<string | null> {
    const audioPath = join(this.getAudioDir(chatId), audioFileName);
    if (!existsSync(audioPath)) {
      return null;
    }
    try {
      const buffer = await readFile(audioPath);
      return `data:audio/wav;base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  async exportChatAsMarkdown(chatId: string): Promise<string> {
    const chat = await this.getChat(chatId);
    if (!chat) return "";

    const lines: string[] = [];
    lines.push(`# ${chat.title}`);
    lines.push(`*Fecha: ${new Date(chat.createdAt).toLocaleString()}*`);
    lines.push("");

    if (chat.studyMaterial) {
      lines.push("### Material de Estudio");
      lines.push(chat.studyMaterial);
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    lines.push("### Historial de Conversación");
    lines.push("");

    for (const msg of chat.messages) {
      const speaker = msg.role === "user" ? "**Usuario**" : "**Tutor (Modelo)**";
      const time = new Date(msg.timestamp).toLocaleTimeString();
      lines.push(`${speaker} *(${time})*:`);
      lines.push(msg.text || "*(Audio)*");
      lines.push("");
    }

    return lines.join("\n");
  }
}
