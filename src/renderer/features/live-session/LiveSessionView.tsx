import type React from "react";
import { useEffect, useState } from "react";
import type { SessionState } from "../../../domain/session-state";
import { Button } from "../../components/Button";
import { WaveformVisualizer } from "../../components/WaveformVisualizer";
import { LiveTextComposer } from "./LiveTextComposer";

export interface LiveSessionViewProps {
  state: SessionState;
  isMuted: boolean;
  volume: number;
  onToggleMute: () => void;
  onSendText: (text: string) => void;
  onStop: () => void;
  onOpenFallback: () => void;
}

export const LiveSessionView: React.FC<LiveSessionViewProps> = ({
  state,
  isMuted,
  volume,
  onToggleMute,
  onSendText,
  onStop,
  onOpenFallback,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (state.status === "listening" || state.status === "speaking") {
      const interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
    setElapsedSeconds(0);
  }, [state.status]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSecs % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const isSpeaking = state.status === "speaking";

  return (
    <div className="live-session-view">
      <div className="session-header">
        <div className="status-pill">
          <span
            className={`status-dot ${
              isSpeaking
                ? "dot-indigo"
                : state.status === "reconnecting"
                  ? "dot-amber"
                  : state.status === "connecting"
                    ? "dot-amber"
                    : "dot-green"
            }`}
          />
          <span>
            Gemini 3.1 Flash Live —{" "}
            {isSpeaking
              ? "Respondiendo"
              : state.status === "reconnecting"
                ? `Reconectando (${state.attempt}/${state.maxAttempts})`
                : state.status === "connecting"
                  ? "Conectando..."
                  : "Conectado"}
          </span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            color: "var(--text-secondary)",
          }}
        >
          {formatTimer(elapsedSeconds)}
        </div>
      </div>

      <div className="live-visualizer">
        <div className={`pulsing-orb ${isSpeaking ? "orb-speaking" : ""}`}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isSpeaking ? (
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            ) : (
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            )}
          </svg>
        </div>

        <div className="session-status-text">
          {state.status === "connecting" && "Conectando con Gemini Live..."}
          {state.status === "listening" && "Escuchando tu voz..."}
          {state.status === "speaking" && "Tutor explicando..."}
          {state.status === "reconnecting" &&
            `Reconectando (${state.attempt}/${state.maxAttempts})...`}
        </div>

        <WaveformVisualizer volume={volume} isSpeaking={isSpeaking} />
      </div>

      <LiveTextComposer
        onSend={onSendText}
        disabled={state.status !== "listening" && state.status !== "speaking"}
      />

      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "20px",
        }}
      >
        <Button variant="secondary" size="sm" onClick={onOpenFallback}>
          Usar Fallback / Otra IA
        </Button>

        <div style={{ display: "flex", gap: "10px" }}>
          <Button
            variant="secondary"
            size="md"
            onClick={onToggleMute}
            title={isMuted ? "Reanudar micrófono" : "Silenciar micrófono"}
          >
            {isMuted ? "Activar Micrófono" : "Silenciar Mic"}
          </Button>

          <Button variant="danger" size="md" onClick={onStop}>
            Terminar Conversación
          </Button>
        </div>
      </div>
    </div>
  );
};
