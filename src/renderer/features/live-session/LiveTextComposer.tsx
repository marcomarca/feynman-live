import type React from "react";
import { useState } from "react";

export interface LiveTextComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const LiveTextComposer: React.FC<LiveTextComposerProps> = ({ onSend, disabled = false }) => {
  const [text, setText] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="live-composer-box">
      <input
        type="text"
        className="composer-input"
        placeholder="Escribe algo durante la conversación... (Enter para enviar)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        type="button"
        className="btn-icon"
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        title="Enviar mensaje de texto en caliente"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
};
