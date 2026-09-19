import { type BrowserWindow, dialog, ipcMain } from "electron";
import type { ClipboardPort } from "../adapters/desktop/ClipboardAdapter";
import type { ExternalProviderLauncherPort } from "../adapters/desktop/ExternalProviderLauncher";
import type { DataStorePort } from "../adapters/persistence/AppDataStore";
import type { ChatStorePort } from "../adapters/persistence/ChatHistoryStore";
import { type AppError, createAppError } from "../domain/app-error";
import type { FallbackProviderId, SettingsPatch } from "../domain/app-settings";
import type { CreateChatInput, UpdateChatInput } from "../domain/chat";
import { type Result, err, isErr, ok } from "../domain/result";
import type { PortablePromptService } from "../services/PortablePromptService";
import type { SettingsService } from "../services/SettingsService";
import type { StudySessionService } from "../services/StudySessionService";
import { IPC_CHANNELS } from "../shared/ipc-contract";

export interface IpcHandlerDependencies {
  dataStore: DataStorePort;
  chatStore: ChatStorePort;
  settingsService: SettingsService;
  promptService: PortablePromptService;
  providerLauncher: ExternalProviderLauncherPort;
  clipboardAdapter: ClipboardPort;
  sessionService: StudySessionService;
  getMainWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(deps: IpcHandlerDependencies): void {
  const {
    dataStore,
    chatStore,
    settingsService,
    promptService,
    providerLauncher,
    sessionService,
    getMainWindow,
  } = deps;

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_UPDATE,
    async (_, patch: SettingsPatch): Promise<Result<void, AppError>> => {
      return settingsService.updateSettings(patch);
    },
  );

  // Secrets
  ipcMain.handle(IPC_CHANNELS.SECRETS_HAS_KEY, async () => {
    return settingsService.hasGeminiKey();
  });

  ipcMain.handle(
    IPC_CHANNELS.SECRETS_SAVE_KEY,
    async (_, key: string): Promise<Result<void, AppError>> => {
      return settingsService.saveGeminiKey(key);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SECRETS_DELETE_KEY, async (): Promise<Result<void, AppError>> => {
    return settingsService.deleteGeminiKey();
  });

  ipcMain.handle(IPC_CHANNELS.SECRETS_TEST_KEY, async (): Promise<Result<void, AppError>> => {
    return settingsService.testGeminiKey();
  });

  // Content
  ipcMain.handle(IPC_CHANNELS.CONTENT_LOAD_PROMPT, async () => {
    return dataStore.loadTutorPrompt();
  });

  ipcMain.handle(
    IPC_CHANNELS.CONTENT_SAVE_PROMPT,
    async (_, content: string): Promise<Result<void, AppError>> => {
      return dataStore.saveTutorPrompt(content);
    },
  );

  ipcMain.handle(IPC_CHANNELS.CONTENT_RESTORE_PROMPT, async () => {
    return dataStore.restoreDefaultTutorPrompt();
  });

  ipcMain.handle(IPC_CHANNELS.CONTENT_LOAD_MATERIAL, async () => {
    return dataStore.loadStudyMaterial();
  });

  ipcMain.handle(
    IPC_CHANNELS.CONTENT_SAVE_MATERIAL,
    async (_, content: string): Promise<Result<void, AppError>> => {
      return dataStore.saveStudyMaterial(content);
    },
  );

  ipcMain.handle(IPC_CHANNELS.CONTENT_COMPILE_FALLBACK, async () => {
    return promptService.compilePrompt();
  });

  ipcMain.handle(IPC_CHANNELS.CONTENT_COPY_FALLBACK, async (): Promise<Result<void, AppError>> => {
    return promptService.copyPrompt();
  });

  ipcMain.handle(
    IPC_CHANNELS.CONTENT_EXPORT_FALLBACK,
    async (): Promise<Result<{ path: string }, AppError>> => {
      const win = getMainWindow();
      const saveRes = await dialog.showSaveDialog(win ?? (undefined as unknown as BrowserWindow), {
        title: "Exportar Prompt Portable",
        defaultPath: "feynman-study-prompt.md",
        filters: [
          { name: "Markdown", extensions: ["md"] },
          { name: "Text Files", extensions: ["txt"] },
        ],
      });

      if (saveRes.canceled || !saveRes.filePath) {
        return err(createAppError("UNKNOWN", "Exportación cancelada por el usuario"));
      }

      const exportRes = await promptService.exportToFile(saveRes.filePath);
      if (isErr(exportRes)) {
        return exportRes;
      }
      return ok({ path: saveRes.filePath });
    },
  );

  // Chats & History
  ipcMain.handle(IPC_CHANNELS.CHATS_LIST, async () => {
    return chatStore.listChats();
  });

  ipcMain.handle(IPC_CHANNELS.CHATS_GET, async (_, id: string) => {
    return chatStore.getChat(id);
  });

  ipcMain.handle(IPC_CHANNELS.CHATS_CREATE, async (_, input: CreateChatInput) => {
    return chatStore.createChat(input);
  });

  ipcMain.handle(IPC_CHANNELS.CHATS_UPDATE, async (_, id: string, input: UpdateChatInput) => {
    return chatStore.updateChat(id, input);
  });

  ipcMain.handle(IPC_CHANNELS.CHATS_DELETE, async (_, id: string) => {
    return chatStore.deleteChat(id);
  });

  ipcMain.handle(IPC_CHANNELS.CHATS_EXPORT_MD, async (_, id: string) => {
    return chatStore.exportChatAsMarkdown(id);
  });

  // Providers
  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_OPEN,
    async (_, providerId: FallbackProviderId): Promise<Result<void, AppError>> => {
      return providerLauncher.openProvider(providerId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_COPY_AND_OPEN,
    async (_, providerId: FallbackProviderId): Promise<Result<void, AppError>> => {
      const copyRes = await promptService.copyPrompt();
      if (isErr(copyRes)) {
        return copyRes;
      }
      return providerLauncher.openProvider(providerId);
    },
  );

  // Session
  ipcMain.handle(
    IPC_CHANNELS.SESSION_START,
    async (
      _,
      chatId?: string,
      options?: { includeHistory?: boolean },
    ): Promise<Result<void, AppError>> => {
      return sessionService.start(chatId, options);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SEND_TEXT,
    async (_, text: string): Promise<Result<void, AppError>> => {
      return sessionService.sendText(text);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_MUTE,
    async (_, muted: boolean): Promise<Result<void, AppError>> => {
      return sessionService.mute(muted);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async (): Promise<Result<void, AppError>> => {
    return sessionService.stop();
  });

  // Audio Stream In (Renderer -> Main)
  ipcMain.on(IPC_CHANNELS.SESSION_AUDIO_IN, (_, rawChunk: Uint8Array | Buffer | ArrayBuffer) => {
    let chunk: Uint8Array;
    if (rawChunk instanceof Uint8Array) {
      chunk = rawChunk;
    } else if (rawChunk instanceof ArrayBuffer) {
      chunk = new Uint8Array(rawChunk);
    } else {
      chunk = new Uint8Array(rawChunk);
    }
    sessionService.sendAudio(chunk);
  });

  // Audio Stream Out & State (Main -> Renderer)
  sessionService.onAudioChunk((chunk) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SESSION_AUDIO_OUT, chunk);
    }
  });

  sessionService.onTextDelta((delta) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SESSION_TEXT_DELTA, delta);
    }
  });

  sessionService.onMessageComplete((message) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SESSION_MESSAGE_COMPLETE, message);
    }
  });

  sessionService.onInterrupted(() => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SESSION_INTERRUPTED);
    }
  });

  sessionService.onState((state) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SESSION_STATE_CHANGED, state);
    }
  });

  // Window Controls
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_HIDE, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  });
}
