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

  useEffect(() => {
    setVoice(settings.voice);
    setThinkingLevel(settings.thinkingLevel);
    setGlobalShortcut(settings.globalShortcut);
    setLaunchAtLogin(settings.launchAtLogin);
    setPreferredFallback(settings.preferredFallbackProvider);
  }, [settings]);

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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="text"
              className="form-input"
              value="••••••••••••••••••••••••••••••••"
              disabled
              style={{ flex: 1, letterSpacing: "2px" }}
            />
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

      <div
        className="form-group"
        style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}
      >
        <input
          type="checkbox"
          id="launchAtLogin"
          checked={launchAtLogin}
          onChange={(e) => setLaunchAtLogin(e.target.checked)}
        />
        <label
          htmlFor="launchAtLogin"
          style={{ fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          Iniciar automáticamente con Windows
        </label>
      </div>
    </Modal>
  );
};
