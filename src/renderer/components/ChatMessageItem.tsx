import type React from "react";
import { useState } from "react";
import type { ChatMessage } from "../../domain/chat";
import { AudioPlayerBar } from "./AudioPlayerBar";

interface ChatMessageItemProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isStreaming = false,
  onStopStreaming,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const hasText = Boolean(message.text && message.text.trim().length > 0);
  const hasAudio = Boolean(message.audioBase64 && message.audioBase64.trim().length > 0);

  if (!hasText && !hasAudio && !isStreaming) {
    return null;
  }

  const handleCopy = async () => {
    if (!message.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className={`chat-message-item ${isUser ? "user-message" : "model-message"}`}>
      <div className="message-header">
        <div className="message-role-tag">
          {isUser ? (
            <span className="role-label user-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                role="img"
                aria-label="Usuario"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              User
            </span>
          ) : (
            <span className="role-label model-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                role="img"
                aria-label="Modelo"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Model
            </span>
          )}
        </div>

        <div className="message-actions">
          {isStreaming && onStopStreaming && (
            <button
              type="button"
              className="stop-stream-btn"
              onClick={onStopStreaming}
              title="Detener respuesta"
            >
              <span className="stop-square" />
            </button>
          )}

          {message.text && (
            <button
              type="button"
              className="copy-msg-btn"
              onClick={handleCopy}
              title="Copiar texto del mensaje"
            >
              {copied ? (
                <span className="copied-text">Copiado ✓</span>
              ) : (
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
              )}
            </button>
          )}
        </div>
      </div>

      {/* Audio player if audio recording exists */}
      {message.audioBase64 && !isStreaming && (
        <AudioPlayerBar audioBase64={message.audioBase64} durationMs={message.audioDurationMs} />
      )}

      {/* Live Waveform if model is currently generating */}
      {isStreaming && (
        <div className="live-waveform-container">
          <div className="live-waveform-bars">
            <span className="wave-bar bar-1" />
            <span className="wave-bar bar-2" />
            <span className="wave-bar bar-3" />
            <span className="wave-bar bar-4" />
            <span className="wave-bar bar-5" />
          </div>
        </div>
      )}

      {/* Text content */}
      {message.text ? (
        <div className="message-body">{message.text}</div>
      ) : (
        isStreaming && (
          <div className="message-body streaming-placeholder">Generando respuesta...</div>
        )
      )}
    </div>
  );
};
