import type React from "react";
import type { SessionState } from "../../domain/session-state";

export interface StatusBadgeProps {
  state: SessionState;
  hasApiKey: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state, hasApiKey }) => {
  if (!hasApiKey) {
    return (
      <div className="status-pill">
        <span className="status-dot dot-amber" />
        <span>API key pendiente</span>
      </div>
    );
  }

  switch (state.status) {
    case "idle":
      return (
        <div className="status-pill">
          <span className="status-dot dot-green" />
          <span>Gemini: listo</span>
        </div>
      );
    case "connecting":
      return (
        <div className="status-pill">
          <span className="status-dot dot-indigo" />
          <span>Conectando...</span>
        </div>
      );
    case "listening":
      return (
        <div className="status-pill">
          <span className="status-dot dot-cyan" style={{ background: "#06b6d4" }} />
          <span>Escuchando</span>
        </div>
      );
    case "speaking":
      return (
        <div className="status-pill">
          <span className="status-dot dot-indigo" />
          <span>Hablando</span>
        </div>
      );
    case "reconnecting":
      return (
        <div className="status-pill">
          <span className="status-dot dot-amber" />
          <span>
            Reconectando ({state.attempt}/{state.maxAttempts})
          </span>
        </div>
      );
    case "stopping":
      return (
        <div className="status-pill">
          <span className="status-dot dot-gray" />
          <span>Deteniendo...</span>
        </div>
      );
    case "error":
      return (
        <div className="status-pill">
          <span className="status-dot dot-rose" />
          <span>Error de sesión</span>
        </div>
      );
  }
};
