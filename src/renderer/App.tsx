import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, FallbackProviderId, SettingsPatch } from "../domain/app-settings";
import { DEFAULT_APP_SETTINGS } from "../domain/app-settings";
import type { SessionState } from "../domain/session-state";
import { INITIAL_SESSION_STATE } from "../domain/session-state";
import { Button } from "./components/Button";
import { StatusBadge } from "./components/StatusBadge";
import { FallbackModal } from "./features/fallback/FallbackModal";
import { LiveSessionView } from "./features/live-session/LiveSessionView";
import { MaterialEditor } from "./features/material-editor/MaterialEditor";
import { PromptEditor } from "./features/prompt-editor/PromptEditor";
import { SettingsModal } from "./features/settings/SettingsModal";

import { MicrophoneCapture } from "./audio/microphone";
import { AudioPlaybackQueue } from "./audio/playback";

export const App: React.FC = () => {
  const api = window.feynmanDesktopApi;

  // Content state
  const [tutorPrompt, setTutorPrompt] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");
  const [compiledPrompt, setCompiledPrompt] = useState("");

  // Settings & Secrets
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Session state
  const [sessionState, setSessionState] = useState<SessionState>(INITIAL_SESSION_STATE);
  const [isMuted, setIsMuted] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);

  // Modals & UI
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

  // Debounce timers
  const promptDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const materialDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial Load
  useEffect(() => {
    if (!api) return;

    api.content.loadTutorPrompt().then(setTutorPrompt);
    api.content.loadStudyMaterial().then(setStudyMaterial);
    api.settings.get().then(setSettings);
    api.secrets.hasGeminiKey().then(setHasApiKey);

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

    const unsubInterrupted = api.session.onInterrupted(() => {
      playbackQueueRef.current.clear();
    });

    return () => {
      unsubState();
      unsubAudio();
      unsubInterrupted();
      micCaptureRef.current.stop();
      playbackQueueRef.current.close();
    };
  }, [api]);

  // Prompt update with debounce
  const handlePromptChange = (value: string) => {
    setTutorPrompt(value);
    if (!api) return;
    if (promptDebounceRef.current) clearTimeout(promptDebounceRef.current);
    promptDebounceRef.current = setTimeout(() => {
      api.content.saveTutorPrompt(value);
    }, 500);
  };

  const handleRestorePrompt = async () => {
    if (!api) return;
    const restored = await api.content.restoreTutorPrompt();
    setTutorPrompt(restored);
  };

  // Material update with debounce
  const handleMaterialChange = (value: string) => {
    setStudyMaterial(value);
    if (!api) return;
    if (materialDebounceRef.current) clearTimeout(materialDebounceRef.current);
    materialDebounceRef.current = setTimeout(() => {
      api.content.saveStudyMaterial(value);
    }, 500);
  };

  const handleClearMaterial = () => {
    handleMaterialChange("");
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

  // Live Session Controls
  const handleStartSession = async () => {
    if (!api) return;
    if (!hasApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // Flush any pending debounced changes immediately before connecting
    if (promptDebounceRef.current) clearTimeout(promptDebounceRef.current);
    if (materialDebounceRef.current) clearTimeout(materialDebounceRef.current);
    await api.content.saveTutorPrompt(tutorPrompt);
    await api.content.saveStudyMaterial(studyMaterial);

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

      const res = await api.session.start();
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
    await api.session.stop();
  };

  const handleToggleMute = async () => {
    if (!api) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await api.session.mute(nextMuted);
  };

  const handleSendLiveText = (text: string) => {
    if (!api) return;
    api.session.sendText(text);
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
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span>Feynman Live</span>
          <span className="titlebar-badge">v0.1.0</span>
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-workspace">
        {isLiveActive ? (
          <LiveSessionView
            state={sessionState}
            isMuted={isMuted}
            volume={audioVolume}
            onToggleMute={handleToggleMute}
            onSendText={handleSendLiveText}
            onStop={handleStopSession}
            onOpenFallback={() => handleOpenFallbackModal()}
          />
        ) : (
          <>
            <div className="editors-grid">
              <PromptEditor
                value={tutorPrompt}
                onChange={handlePromptChange}
                onRestoreDefault={handleRestorePrompt}
              />
              <MaterialEditor
                value={studyMaterial}
                onChange={handleMaterialChange}
                onClear={handleClearMaterial}
              />
            </div>

            {/* Control Dock */}
            <div className="control-dock">
              <div className="dock-left">
                <StatusBadge state={sessionState} hasApiKey={hasApiKey} />
              </div>

              <div className="dock-center">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleStartSession}
                  title={
                    hasApiKey
                      ? "Iniciar conversación con Gemini Live"
                      : "Configurar API key para iniciar"
                  }
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Iniciar Conversación
                </Button>
              </div>

              <div className="dock-right">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleOpenFallbackModal()}
                  title="Generar prompt portable para usar en ChatGPT o Google AI Studio"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Usar en Otra IA / Fallback
                </Button>
              </div>
            </div>
          </>
        )}
      </main>

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
