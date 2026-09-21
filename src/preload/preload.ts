import { contextBridge, ipcRenderer } from "electron";
import type { AppError } from "../domain/app-error";
import type { AppSettings, FallbackProviderId, SettingsPatch } from "../domain/app-settings";
import type {
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
  CreateChatInput,
  UpdateChatInput,
} from "../domain/chat";
import type { Result } from "../domain/result";
import type { SessionState } from "../domain/session-state";
import {
  type FeynmanDesktopApi,
  IPC_CHANNELS,
  type UpdateCheckResult,
} from "../shared/ipc-contract";

const api: FeynmanDesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (patch: SettingsPatch) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, patch),
  },

  secrets: {
    hasGeminiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SECRETS_HAS_KEY),
    saveGeminiKey: (value: string) => ipcRenderer.invoke(IPC_CHANNELS.SECRETS_SAVE_KEY, value),
    deleteGeminiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SECRETS_DELETE_KEY),
    testGeminiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SECRETS_TEST_KEY),
  },

  content: {
    loadTutorPrompt: () => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_LOAD_PROMPT),
    saveTutorPrompt: (value: string) => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_SAVE_PROMPT, value),
    restoreTutorPrompt: () => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_RESTORE_PROMPT),

    loadStudyMaterial: () => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_LOAD_MATERIAL),
    saveStudyMaterial: (value: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONTENT_SAVE_MATERIAL, value),

    compilePortablePrompt: () => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_COMPILE_FALLBACK),
    copyPortablePrompt: () => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_COPY_FALLBACK),
    exportPortablePrompt: () => ipcRenderer.invoke(IPC_CHANNELS.CONTENT_EXPORT_FALLBACK),
  },

  chats: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CHATS_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CHATS_GET, id),
    create: (input: CreateChatInput) => ipcRenderer.invoke(IPC_CHANNELS.CHATS_CREATE, input),
    update: (id: string, input: UpdateChatInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHATS_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CHATS_DELETE, id),
    exportMarkdown: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CHATS_EXPORT_MD, id),
  },

  session: {
    start: (chatId?: string, options?: { includeHistory?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, chatId, options),
    sendText: (value: string) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_SEND_TEXT, value),
    mute: (value: boolean) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_MUTE, value),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP),

    sendAudioChunk: (chunk: Uint8Array) => {
      ipcRenderer.send(IPC_CHANNELS.SESSION_AUDIO_IN, chunk);
    },

    endAudioStream: () => {
      ipcRenderer.send(IPC_CHANNELS.SESSION_AUDIO_STREAM_END);
    },

    notifySpeechStart: () => {
      ipcRenderer.send(IPC_CHANNELS.SESSION_SPEECH_START);
    },

    onAudioChunk: (listener: (chunk: Uint8Array) => void) => {
      const handler = (_: unknown, buffer: ArrayBuffer | Uint8Array) => {
        const chunk = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        listener(chunk);
      };
      ipcRenderer.on(IPC_CHANNELS.SESSION_AUDIO_OUT, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SESSION_AUDIO_OUT, handler);
      };
    },

    onTextDelta: (listener: (delta: string) => void) => {
      const handler = (_: unknown, delta: string) => listener(delta);
      ipcRenderer.on(IPC_CHANNELS.SESSION_TEXT_DELTA, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SESSION_TEXT_DELTA, handler);
      };
    },

    onMessageComplete: (listener: (message: ChatMessage) => void) => {
      const handler = (_: unknown, message: ChatMessage) => listener(message);
      ipcRenderer.on(IPC_CHANNELS.SESSION_MESSAGE_COMPLETE, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SESSION_MESSAGE_COMPLETE, handler);
      };
    },

    onInterrupted: (listener: () => void) => {
      const handler = () => listener();
      ipcRenderer.on(IPC_CHANNELS.SESSION_INTERRUPTED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SESSION_INTERRUPTED, handler);
      };
    },

    onState: (listener: (state: SessionState) => void) => {
      const handler = (_: unknown, state: SessionState) => listener(state);
      ipcRenderer.on(IPC_CHANNELS.SESSION_STATE_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STATE_CHANGED, handler);
      };
    },
  },

  providers: {
    open: (provider: FallbackProviderId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_OPEN, provider),
    copyAndOpen: (provider: FallbackProviderId) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_COPY_AND_OPEN, provider),
  },

  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
    hide: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_HIDE),
  },

  updater: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.AUTOUPDATE_CHECK),
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.AUTOUPDATE_GET_VERSION),
    getVersionInfo: () => ipcRenderer.invoke(IPC_CHANNELS.AUTOUPDATE_GET_VERSION_INFO),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.AUTOUPDATE_INSTALL),
    openDownload: (url?: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTOUPDATE_OPEN_EXTERNAL, url),
    onStatusChange: (listener: (result: UpdateCheckResult) => void) => {
      const handler = (_: unknown, result: UpdateCheckResult) => listener(result);
      ipcRenderer.on(IPC_CHANNELS.AUTOUPDATE_STATUS_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AUTOUPDATE_STATUS_CHANGED, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("feynmanDesktopApi", api);
