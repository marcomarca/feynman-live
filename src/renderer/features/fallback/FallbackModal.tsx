import type React from "react";
import { useEffect, useState } from "react";
import type { FallbackProviderId } from "../../../domain/app-settings";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

export interface FallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  compiledPrompt: string;
  onCopy: () => Promise<void>;
  onCopyAndOpen: (provider: FallbackProviderId) => Promise<void>;
  onExport: () => Promise<void>;
  noticeMessage?: string;
  isAuthError?: boolean;
  onOpenSettings?: () => void;
}

export const FallbackModal: React.FC<FallbackModalProps> = ({
  isOpen,
  onClose,
  compiledPrompt,
  onCopy,
  onCopyAndOpen,
  onExport,
  noticeMessage,
  isAuthError,
  onOpenSettings,
}) => {
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (copiedStatus) {
      const timer = setTimeout(() => setCopiedStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [copiedStatus]);

  const handleCopy = async () => {
    await onCopy();
    setCopiedStatus("¡Prompt completo copiado al portapapeles!");
  };

  const handleCopyAndOpen = async (provider: FallbackProviderId) => {
    await onCopyAndOpen(provider);
    setCopiedStatus(
      `¡Copiado! Abriendo ${provider === "google-ai-studio" ? "Google AI Studio" : "ChatGPT"}...`,
    );
  };

  const handleExport = async () => {
    await onExport();
    setCopiedStatus("Archivo exportado correctamente.");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAuthError ? "⚠️ Error de Autenticación — Gemini Live" : "Modo Portable Autónomo — Fallback para Cualquier IA"}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Funciona 100% offline y sin consumir cuota de API.
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      {isAuthError ? (
        <div
          style={{
            padding: "16px",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "20px" }}>🚨</span>
            <strong style={{ color: "#f87171", fontSize: "15px" }}>Problema con tu API Key de Gemini</strong>
          </div>
          <p style={{ margin: "0 0 14px 0", fontSize: "13px", lineHeight: "1.5", color: "var(--text-primary)" }}>
            {noticeMessage || "Tu API Key de Gemini no es válida o fue reportada como filtrada (leaked) y revocada por Google."}
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {onOpenSettings && (
              <Button
                variant="primary"
                onClick={onOpenSettings}
                style={{ background: "#dc2626", borderColor: "#ef4444" }}
              >
                ⚙️ Ir a Configuración y Cambiar API Key
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => handleCopyAndOpen("google-ai-studio")}
            >
              🔑 Obtener Nueva Clave en AI Studio
            </Button>
          </div>
        </div>
      ) : noticeMessage ? (
        <div className="alert-box alert-warning">
          <strong>Aviso:</strong>
          <span>{noticeMessage}</span>
        </div>
      ) : null}

      {copiedStatus && (
        <div className="alert-box alert-success">
          <span>{copiedStatus}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <span className="form-label">Acciones Rápidas:</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <Button variant="primary" onClick={() => handleCopyAndOpen("google-ai-studio")}>
            Copiar + Abrir AI Studio
          </Button>
          <Button variant="primary" onClick={() => handleCopyAndOpen("chatgpt")}>
            Copiar + Abrir ChatGPT
          </Button>
          <Button variant="secondary" onClick={handleCopy}>
            Copiar Prompt Completo
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            Exportar como Archivo .md
          </Button>
        </div>
      </div>

      <div className="form-group" style={{ marginTop: "10px" }}>
        <span className="form-label">Vista Previa del Paquete de Estudio:</span>
        <textarea
          className="form-input"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            height: "180px",
            resize: "vertical",
            whiteSpace: "pre-wrap",
          }}
          value={compiledPrompt}
          readOnly
        />
      </div>
    </Modal>
  );
};
