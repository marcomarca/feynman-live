import type React from "react";
import { useEffect, useState } from "react";
import type {
  AppSettings,
  FallbackProviderId,
  ResponseModality,
  SettingsPatch,
  ThinkingLevel,
} from "../../../domain/app-settings";
import {
  AVAILABLE_THINKING_LEVELS,
  AVAILABLE_VOICES,
  GEMINI_LIVE_MODEL,
} from "../../../shared/constants";
import type { UpdateCheckResult } from "../../../shared/ipc-contract";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  hasApiKey: boolean;
  onSaveSettings: (patch: SettingsPatch) => Promise<void>;
  onSaveApiKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteApiKey: () => Promise<void>;
  onTestApiKey: () => Promise<{ success: boolean; error?: string }>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  hasApiKey,
  onSaveSettings,
  onSaveApiKey,
  onDeleteApiKey,
  onTestApiKey,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [voice, setVoice] = useState(settings.voice);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(settings.thinkingLevel);
  const [globalShortcut, setGlobalShortcut] = useState(settings.globalShortcut);
  const [launchAtLogin, setLaunchAtLogin] = useState(settings.launchAtLogin);
  const [preferredFallback, setPreferredFallback] = useState<FallbackProviderId>(
    settings.preferredFallbackProvider,
  );
  const [startWithContext, setStartWithContext] = useState(settings.startWithContext ?? true);

  const [appVersion, setAppVersion] = useState("0.1.6");
  const [isPortable, setIsPortable] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    setVoice(settings.voice);
    setThinkingLevel(settings.thinkingLevel);
    setGlobalShortcut(settings.globalShortcut);
    setLaunchAtLogin(settings.launchAtLogin);
    setPreferredFallback(settings.preferredFallbackProvider);
    setStartWithContext(settings.startWithContext ?? true);
  }, [settings]);

  useEffect(() => {
    if (window.feynmanDesktopApi?.updater) {
      window.feynmanDesktopApi.updater
        .getVersionInfo()
        .then((info) => {
          setAppVersion(info.version);
          setIsPortable(info.isPortable);
        })
        .catch(() => {});

      const unsubscribe = window.feynmanDesktopApi.updater.onStatusChange?.((res) => {
        setUpdateStatus(res);
      });
      return () => {
        unsubscribe?.();
      };
    }
  }, []);

  const handleCheckUpdates = async () => {
    if (!window.feynmanDesktopApi?.updater) return;
    setIsCheckingUpdate(true);
    try {
      const res = await window.feynmanDesktopApi.updater.check();
      setUpdateStatus(res);
    } catch {
      setUpdateStatus({
        status: "error",
        currentVersion: appVersion,
        message: "No se pudo conectar con el servidor de actualizaciones.",
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!window.feynmanDesktopApi?.updater) return;
    await window.feynmanDesktopApi.updater.install();
  };

  const handleDownloadPortable = async (url?: string) => {
    if (!window.feynmanDesktopApi?.updater) return;
    await window.feynmanDesktopApi.updater.openDownload(url);
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setStatusMsg({ type: "info", text: "Guardando clave..." });
    const res = await onSaveApiKey(apiKeyInput.trim());
    if (res.success) {
      setApiKeyInput("");
      setIsEditingKey(false);
      setStatusMsg({
        type: "success",
        text: "API Key guardada de forma segura con cifrado DPAPI.",
      });
    } else {
      setStatusMsg({ type: "error", text: res.error || "No se pudo guardar la clave." });
    }
  };

  const handleDeleteKey = async () => {
    await onDeleteApiKey();
    setApiKeyInput("");
    setIsEditingKey(false);
    setStatusMsg({ type: "info", text: "API Key eliminada del almacenamiento seguro." });
  };

  const handleTestKey = async () => {
    setStatusMsg({ type: "info", text: "Validando credenciales..." });
    const res = await onTestApiKey();
    if (res.success) {
      setStatusMsg({ type: "success", text: "✓ API Key válida y lista para Gemini Live." });
    } else {
      setStatusMsg({ type: "error", text: res.error || "✗ Error al verificar la API Key." });
    }
  };

  const handleSaveGeneral = async () => {
    await onSaveSettings({
      voice,
      thinkingLevel,
      responseModality: "AUDIO",
      globalShortcut,
      launchAtLogin,
      preferredFallbackProvider: preferredFallback,
      startWithContext,
    });
    setStatusMsg({ type: "success", text: "Configuración guardada correctamente." });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configuración de Feynman Live"
      footer={
        <div style={{ display: "flex", gap: "10px" }}>
          <Button variant="primary" onClick={handleSaveGeneral}>
            Guardar Cambios
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      {statusMsg && (
        <div className={`alert-box alert-${statusMsg.type}`}>
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Gemini Settings */}
      <div className="form-group">
        <span className="form-label">Google Gemini Live API Key:</span>
        {hasApiKey && !isEditingKey ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              className="form-input"
              value="••••••••••••••••••••••••••••••••"
              disabled
              style={{ flex: "1 1 200px", letterSpacing: "2px" }}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <Button size="sm" variant="secondary" onClick={() => setIsEditingKey(true)}>
                Cambiar
              </Button>
              <Button size="sm" variant="secondary" onClick={handleTestKey}>
                Probar
              </Button>
              <Button size="sm" variant="danger" onClick={handleDeleteKey}>
                Eliminar
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="password"
              className="form-input"
              placeholder="Pega aquí tu clave AIzaSy..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              size="sm"
              variant="primary"
              onClick={handleSaveKey}
              disabled={!apiKeyInput.trim()}
            >
              Guardar Clave
            </Button>
            {hasApiKey && (
              <Button size="sm" variant="secondary" onClick={() => setIsEditingKey(false)}>
                Cancelar
              </Button>
            )}
          </div>
        )}
        <span className="form-help">
          Tu clave se almacena localmente mediante DPAPI (safeStorage) y nunca se incluye en prompts
          exportados.
        </span>
      </div>

      {/* Model & Voice */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="form-group">
          <span className="form-label">Modelo Live:</span>
          <input type="text" className="form-input" value={GEMINI_LIVE_MODEL} disabled />
        </div>

        <div className="form-group">
          <span className="form-label">Voz del Tutor:</span>
          <select className="form-select" value={voice} onChange={(e) => setVoice(e.target.value)}>
            {AVAILABLE_VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="form-group">
          <span className="form-label">Nivel de Pensamiento (Thinking):</span>
          <select
            className="form-select"
            value={thinkingLevel}
            onChange={(e) => setThinkingLevel(e.target.value as ThinkingLevel)}
          >
            {AVAILABLE_THINKING_LEVELS.map((tl) => (
              <option key={tl} value={tl}>
                {tl.charAt(0).toUpperCase() + tl.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <span className="form-label">Proveedor Fallback Preferido:</span>
          <select
            className="form-select"
            value={preferredFallback}
            onChange={(e) => setPreferredFallback(e.target.value as FallbackProviderId)}
          >
            <option value="google-ai-studio">Google AI Studio</option>
            <option value="chatgpt">ChatGPT</option>
          </select>
        </div>
      </div>

      {/* Desktop Integration */}
      <div className="form-group">
        <span className="form-label">Atajo de Teclado Global:</span>
        <input
          type="text"
          className="form-input"
          value={globalShortcut}
          onChange={(e) => setGlobalShortcut(e.target.value)}
          placeholder="CommandOrControl+Shift+Space"
        />
        <span className="form-help">
          Atajo para enfocar y mostrar la aplicación instantáneamente desde cualquier lugar.
        </span>
      </div>

      <label className="setting-toggle-row" htmlFor="launchAtLogin">
        <input
          type="checkbox"
          id="launchAtLogin"
          checked={launchAtLogin}
          onChange={(e) => setLaunchAtLogin(e.target.checked)}
        />
        <div className="setting-toggle-info">
          <span className="setting-toggle-title">Iniciar automáticamente con Windows</span>
          <span className="setting-toggle-desc">
            Abre Feynman Live minimizado en la bandeja del sistema al arrancar el equipo.
          </span>
        </div>
      </label>

      <label className="setting-toggle-row" htmlFor="startWithContext">
        <input
          type="checkbox"
          id="startWithContext"
          checked={startWithContext}
          onChange={(e) => setStartWithContext(e.target.checked)}
        />
        <div className="setting-toggle-info">
          <span className="setting-toggle-title">Iniciar con contexto previo</span>
          <span className="setting-toggle-desc">
            Al continuar una conversación anterior, el tutor recordará todo el historial previo de
            mensajes. Si está desactivado, cada sesión comenzará desde cero sin historial acumulado.
          </span>
        </div>
      </label>

      {/* App Updates Section */}
      <div
        style={{
          marginTop: "20px",
          padding: "16px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                Actualizaciones del Sistema
              </span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: isPortable ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)",
                  color: isPortable ? "var(--accent-amber)" : "#a5b4fc",
                  border: isPortable
                    ? "1px solid rgba(245, 158, 11, 0.3)"
                    : "1px solid rgba(99, 102, 241, 0.3)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {isPortable ? "Portable" : "Instalado"}
              </span>
            </div>
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "3px",
                display: "block",
              }}
            >
              Versión actual:{" "}
              <strong style={{ color: "var(--text-secondary)" }}>v{appVersion}</strong>
            </span>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleCheckUpdates}
            disabled={isCheckingUpdate || updateStatus?.status === "downloading"}
          >
            {isCheckingUpdate ? "Buscando..." : "Buscar actualizaciones"}
          </Button>
        </div>

        {updateStatus && (
          <div
            className={`alert-box ${
              updateStatus.status === "update_available" ||
              updateStatus.status === "ready_to_install"
                ? "alert-warning"
                : updateStatus.status === "downloading"
                  ? "alert-info"
                  : updateStatus.status === "error"
                    ? "alert-error"
                    : "alert-success"
            }`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              width: "100%",
            }}
          >
            <span style={{ flex: 1, minWidth: "200px" }}>{updateStatus.message}</span>
            {updateStatus.status === "ready_to_install" && (
              <Button size="sm" variant="primary" onClick={handleApplyUpdate}>
                Reiniciar y aplicar
              </Button>
            )}
            {updateStatus.status === "update_available" && updateStatus.isPortable && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleDownloadPortable(updateStatus.downloadUrl)}
              >
                Descargar ejecutable {updateStatus.latestVersion || ""}
              </Button>
            )}
            {updateStatus.status === "update_available" && !updateStatus.isPortable && (
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Descargando en segundo plano...
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
