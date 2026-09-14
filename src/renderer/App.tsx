import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, FallbackProviderId, SettingsPatch } from "../domain/app-settings";
import { DEFAULT_APP_SETTINGS } from "../domain/app-settings";
import type { ChatMessage, ChatSession, ChatSessionMeta } from "../domain/chat";
import type { SessionState } from "../domain/session-state";
import { INITIAL_SESSION_STATE } from "../domain/session-state";
import { MicrophoneCapture } from "./audio/microphone";
import { AudioPlaybackQueue } from "./audio/playback";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { ChatSidebar } from "./components/ChatSidebar";
import { FallbackModal } from "./features/fallback/FallbackModal";
import { MaterialEditor } from "./features/material-editor/MaterialEditor";
import { PromptEditor } from "./features/prompt-editor/PromptEditor";
import { SettingsModal } from "./features/settings/SettingsModal";

export const App: React.FC = () => {
  const api = window.feynmanDesktopApi;

  // Chats and active session
  const [chats, setChats] = useState<ChatSessionMeta[]>([]);
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null);

  // Content state
  const [tutorPrompt, setTutorPrompt] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");
  const [compiledPrompt, setCompiledPrompt] = useState("");

  // Real-time live streaming text
  const [streamingText, setStreamingText] = useState("");
  const [historyCopied, setHistoryCopied] = useState(false);
  const [showMaterialDrawer, setShowMaterialDrawer] = useState(false);

  // Text composer input
  const [inputText, setInputText] = useState("");

  // Settings & Secrets
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Session state
  const [sessionState, setSessionState] = useState<SessionState>(INITIAL_SESSION_STATE);
  const [isMuted, setIsMuted] = useState(false);
  const [_audioVolume, setAudioVolume] = useState(0);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFallbackOpen, setIsFallbackOpen] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | undefined>();

  // Audio Pipeline References
  const micCaptureRef = useRef<MicrophoneCapture>(new MicrophoneCapture());
  const playbackQueueRef = useRef<AudioPlaybackQueue>(
    new AudioPlaybackQueue({
      onVolumeChange: (vol) => setAudioVolume(vol),
    }),
  );

  const feedBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll feed on new messages or deltas
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll trigger on new messages or text streaming
  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, streamingText]);

  // Load chat list
  const refreshChatList = useCallback(async () => {
    if (!api) return;
    const list = await api.chats.list();
    setChats(list);
    return list;
  }, [api]);

  // Initial Load
  useEffect(() => {
    if (!api) return;

    api.content.loadTutorPrompt().then(setTutorPrompt);
    api.content.loadStudyMaterial().then(setStudyMaterial);
    api.settings.get().then(setSettings);
    api.secrets.hasGeminiKey().then(setHasApiKey);

    refreshChatList().then(async (list) => {
      if (list && list.length > 0) {
        const first = await api.chats.get(list[0].id);
        setActiveChat(first);
      }
    });

    const unsubState = api.session.onState((state) => {
      setSessionState(state);
      if (state.status === "error") {
        micCaptureRef.current.stop();
        playbackQueueRef.current.clear();
        setFallbackNotice(`Sesión no disponible: ${state.error.message}`);
        setIsFallbackOpen(true);
      }
    });

    const unsubAudio = api.session.onAudioChunk((chunk) => {
      playbackQueueRef.current.enqueuePcm16(chunk);
    });

    const unsubTextDelta = api.session.onTextDelta((delta) => {
      setStreamingText((prev) => prev + delta);
    });

    const unsubMessageComplete = api.session.onMessageComplete((message: ChatMessage) => {
      setStreamingText("");
      setActiveChat((prev) => {
        if (!prev) return prev;
        // Avoid duplicate message IDs
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return {
          ...prev,
          messages: [...prev.messages, message],
        };
      });
      refreshChatList();
    });

    const unsubInterrupted = api.session.onInterrupted(() => {
      playbackQueueRef.current.clear();
      setStreamingText("");
    });

    return () => {
      unsubState();
      unsubAudio();
      unsubTextDelta();
      unsubMessageComplete();
      unsubInterrupted();
      micCaptureRef.current.stop();
      playbackQueueRef.current.close();
    };
  }, [api, refreshChatList]);

  // Chat Actions
  const handleSelectChat = async (id: string) => {
    if (!api) return;
    if (sessionState.status !== "idle") {
      await handleStopSession();
    }
    const chat = await api.chats.get(id);
    setActiveChat(chat);
  };

  const handleNewChat = async () => {
    if (!api) return;
    if (sessionState.status !== "idle") {
      await handleStopSession();
    }
    const newChat = await api.chats.create({
      tutorPrompt,
      studyMaterial,
      voice: settings.voice,
    });
    await refreshChatList();
    setActiveChat(newChat);
  };

  const handleDeleteChat = async (id: string) => {
    if (!api) return;
    if (activeChat?.id === id && sessionState.status !== "idle") {
      await handleStopSession();
    }
    await api.chats.delete(id);
    const updated = await refreshChatList();
    if (activeChat?.id === id) {
      if (updated && updated.length > 0) {
        const next = await api.chats.get(updated[0].id);
        setActiveChat(next);
      } else {
        setActiveChat(null);
      }
    }
  };

  const handleCopyFullHistory = async () => {
    if (!api || !activeChat) return;
    const md = await api.chats.exportMarkdown(activeChat.id);
    if (md) {
      await navigator.clipboard.writeText(md);
      setHistoryCopied(true);
      setTimeout(() => setHistoryCopied(false), 2000);
    }
  };

  // Live Session Controls
  const handleStartSession = async () => {
    if (!api) return;
    if (!hasApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // Ensure we have an active chat or create one
    let targetChatId = activeChat?.id;
    if (!targetChatId) {
      const created = await api.chats.create({
        tutorPrompt,
        studyMaterial,
        voice: settings.voice,
      });
      setActiveChat(created);
      targetChatId = created.id;
      await refreshChatList();
    }

    // Start local audio capture and warm up playback queue
    try {
      await playbackQueueRef.current.warmup();
      await micCaptureRef.current.start({
        targetSampleRate: 16000,
        isAiSpeaking: () => playbackQueueRef.current.isPlaying,
        onAudioChunk: (chunk) => {
          api.session.sendAudioChunk(chunk);
        },
        onVolumeChange: (vol) => {
          setAudioVolume(vol);
        },
      });

      const res = await api.session.start(targetChatId);
      if (!res.ok) {
        micCaptureRef.current.stop();
        playbackQueueRef.current.clear();
        setFallbackNotice(`No se pudo iniciar Gemini Live: ${res.error.message}`);
        setIsFallbackOpen(true);
      }
    } catch (e) {
      micCaptureRef.current.stop();
      setFallbackNotice(
        `Error al acceder al micrófono: ${e instanceof Error ? e.message : String(e)}`,
      );
      setIsFallbackOpen(true);
    }
  };

  const handleStopSession = async () => {
    if (!api) return;
    micCaptureRef.current.stop();
    playbackQueueRef.current.clear();
    setStreamingText("");
    await api.session.stop();
    await refreshChatList();
    if (activeChat) {
      const reloaded = await api.chats.get(activeChat.id);
      setActiveChat(reloaded);
    }
  };

  const handleToggleMute = async () => {
    if (!api) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await api.session.mute(nextMuted);
  };

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!api || !inputText.trim()) return;

    // If session is not active, start session first
    if (sessionState.status === "idle") {
      handleStartSession().then(() => {
        api.session.sendText(inputText.trim());
        setInputText("");
      });
    } else {
      api.session.sendText(inputText.trim());
      setInputText("");
    }
  };

  // Fallback Compilation & Actions
  const refreshCompiledPrompt = useCallback(async () => {
    if (!api) return;
    const compiled = await api.content.compilePortablePrompt();
    setCompiledPrompt(compiled);
  }, [api]);

  const handleOpenFallbackModal = async (notice?: string) => {
    setFallbackNotice(notice);
    await refreshCompiledPrompt();
    setIsFallbackOpen(true);
  };

  const handleCopyFallback = async () => {
    if (!api) return;
    await api.content.copyPortablePrompt();
  };

  const handleCopyAndOpenFallback = async (provider: FallbackProviderId) => {
    if (!api) return;
    await api.providers.copyAndOpen(provider);
  };

  const handleExportFallback = async () => {
    if (!api) return;
    await api.content.exportPortablePrompt();
  };

  // Settings Actions
  const handleSaveSettings = async (patch: SettingsPatch) => {
    if (!api) return;
    await api.settings.update(patch);
    const updated = await api.settings.get();
    setSettings(updated);
  };

  const handleSaveApiKey = async (key: string): Promise<{ success: boolean; error?: string }> => {
    if (!api) return { success: false, error: "API no disponible" };
    const res = await api.secrets.saveGeminiKey(key);
    if (res.ok) {
      const exists = await api.secrets.hasGeminiKey();
      setHasApiKey(exists);
      return { success: true };
    }
    return {
      success: false,
      error: `${res.error.message}${res.error.details ? ` (${res.error.details})` : ""}`,
    };
  };

  const handleDeleteApiKey = async () => {
    if (!api) return;
    await api.secrets.deleteGeminiKey();
    const exists = await api.secrets.hasGeminiKey();
    setHasApiKey(exists);
  };

  const handleTestApiKey = async (): Promise<{ success: boolean; error?: string }> => {
    if (!api) return { success: false, error: "API no disponible" };
    const res = await api.secrets.testGeminiKey();
    if (res.ok) {
      return { success: true };
    }
    return {
      success: false,
      error: `${res.error.message}${res.error.details ? ` (${res.error.details})` : ""}`,
    };
  };

  const isLiveActive =
    sessionState.status === "connecting" ||
    sessionState.status === "listening" ||
    sessionState.status === "speaking" ||
    sessionState.status === "reconnecting";

  return (
    <div className="app-container">
      {/* Titlebar */}
      <header className="titlebar">
        <div className="titlebar-brand">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            role="img"
            aria-label="Feynman Logo"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span>Feynman Live</span>
          <span className="titlebar-badge">v0.2.0 • Studio</span>
        </div>

        <div className="titlebar-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => setIsSettingsOpen(true)}
            title="Configuración"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              role="img"
              aria-label="Configuración"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => api?.window.minimize()}
            title="Minimizar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              role="img"
              aria-label="Minimizar"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => api?.window.hide()}
            title="Ocultar a la bandeja"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              role="img"
              aria-label="Cerrar"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2-Column Body */}
      <div className="app-body">
        {/* Left Sidebar */}
        <ChatSidebar
          chats={chats}
          activeChatId={activeChat?.id ?? null}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenFallback={() => handleOpenFallbackModal()}
        />

        {/* Right Studio Playground */}
        <main className="studio-playground">
          {/* Header */}
          <div className="playground-header">
            <div className="playground-header-left">
              <span className="chat-active-title">
                {activeChat?.title || "Nueva Sesión de Estudio"}
              </span>

              <div
                className={`stream-status-pill ${
                  sessionState.status === "listening"
                    ? "status-live"
                    : sessionState.status === "speaking"
                      ? "status-speaking"
                      : ""
                }`}
              >
                <span className={`status-dot ${isLiveActive ? "pulse" : ""}`} />
                <span>
                  {sessionState.status === "listening"
                    ? "Stream is live"
                    : sessionState.status === "speaking"
                      ? "Model hablando"
                      : sessionState.status === "connecting"
                        ? "Conectando..."
                        : sessionState.status === "reconnecting"
                          ? `Reconectando (${sessionState.attempt}/${sessionState.maxAttempts})`
                          : "Listo"}
                </span>
              </div>
            </div>

            <div className="playground-header-right">
              <button
                type="button"
                className="header-action-btn"
                onClick={() => setShowMaterialDrawer(true)}
                title="Editar material de estudio y prompt socrático"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  role="img"
                  aria-label="Editar"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Material de Estudio</span>
              </button>

              <button
                type="button"
                className="header-action-btn"
                onClick={handleCopyFullHistory}
                title="Copiar transcripción completa en Markdown"
              >
                {historyCopied ? (
                  <span style={{ color: "var(--accent-emerald)" }}>¡Historial copiado! ✓</span>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      role="img"
                      aria-label="Copiar"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copiar Historial</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Conversation Feed */}
          <div className="conversation-feed">
            {activeChat?.studyMaterial && (
              <div className="material-banner">
                <div className="material-banner-header">
                  <span>📖 Material Base Vinculado</span>
                </div>
                <div className="material-banner-content">{activeChat.studyMaterial}</div>
              </div>
            )}

            {activeChat?.messages && activeChat.messages.length > 0 ? (
              activeChat.messages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
            ) : (
              <div className="empty-chats-notice" style={{ marginTop: "40px" }}>
                <p>Comienza tu sesión de estudio</p>
                <span>Habla por el micrófono o escribe abajo para interactuar con tu tutor.</span>
              </div>
            )}

            {/* Active Live Streaming Item */}
            {isLiveActive && (streamingText || sessionState.status === "speaking") && (
              <ChatMessageItem
                message={{
                  id: "streaming_model_msg",
                  role: "model",
                  text: streamingText,
                  timestamp: Date.now(),
                }}
                isStreaming={true}
                onStopStreaming={handleStopSession}
              />
            )}

            <div ref={feedBottomRef} />
          </div>

          {/* Bottom Dock */}
          <div className="studio-bottom-dock">
            <form onSubmit={handleSendText} className="dock-controls-row">
              <div className="dock-input-box">
                <input
                  type="text"
                  className="dock-text-input"
                  placeholder="Escribe un mensaje o haz una pregunta..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />

                <button
                  type="submit"
                  className="dock-send-btn"
                  title="Enviar mensaje"
                  aria-label="Enviar"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    role="img"
                    aria-label="Enviar"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>

              {isLiveActive && (
                <button
                  type="button"
                  className={`mic-toggle-btn ${isMuted ? "muted" : ""}`}
                  onClick={handleToggleMute}
                  title={isMuted ? "Reanudar micrófono" : "Silenciar micrófono"}
                >
                  {isMuted ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      role="img"
                      aria-label="Micrófono silenciado"
                    >
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      role="img"
                      aria-label="Micrófono activo"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  )}
                </button>
              )}

              <button
                type="button"
                className={`session-toggle-btn ${isLiveActive ? "btn-stop" : "btn-start"}`}
                onClick={isLiveActive ? handleStopSession : handleStartSession}
              >
                {isLiveActive ? (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      role="img"
                      aria-label="Detener"
                    >
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </svg>
                    <span>Finalizar Sesión</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      role="img"
                      aria-label="Iniciar"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Iniciar Feynman Live</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </main>
      </div>

      {/* Material & Prompt Editor Modal / Drawer */}
      {showMaterialDrawer && (
        <div className="modal-backdrop">
          <div className="material-drawer-modal">
            <div className="modal-header">
              <h3 className="modal-title">Material de Estudio y Prompt del Tutor</h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowMaterialDrawer(false)}
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <div className="material-drawer-body">
              <PromptEditor
                value={tutorPrompt}
                onChange={(val) => {
                  setTutorPrompt(val);
                  api?.content.saveTutorPrompt(val);
                }}
                onRestoreDefault={async () => {
                  if (!api) return;
                  const restored = await api.content.restoreTutorPrompt();
                  setTutorPrompt(restored);
                }}
              />

              <MaterialEditor
                value={studyMaterial}
                onChange={(val) => {
                  setStudyMaterial(val);
                  api?.content.saveStudyMaterial(val);
                }}
                onClear={() => {
                  setStudyMaterial("");
                  api?.content.saveStudyMaterial("");
                }}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowMaterialDrawer(false)}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback Modal */}
      <FallbackModal
        isOpen={isFallbackOpen}
        onClose={() => setIsFallbackOpen(false)}
        compiledPrompt={compiledPrompt}
        onCopy={handleCopyFallback}
        onCopyAndOpen={handleCopyAndOpenFallback}
        onExport={handleExportFallback}
        noticeMessage={fallbackNotice}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        hasApiKey={hasApiKey}
        onSaveSettings={handleSaveSettings}
        onSaveApiKey={handleSaveApiKey}
        onDeleteApiKey={handleDeleteApiKey}
        onTestApiKey={handleTestApiKey}
      />
    </div>
  );
};
