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
}

export const FallbackModal: React.FC<FallbackModalProps> = ({
  isOpen,
  onClose,
  compiledPrompt,
  onCopy,
  onCopyAndOpen,
  onExport,
  noticeMessage,
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
      title="Modo Portable Autónomo — Fallback para Cualquier IA"
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
      {noticeMessage && (
        <div className="alert-box alert-warning">
          <strong>Aviso:</strong>
          <span>{noticeMessage}</span>
        </div>
      )}

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
