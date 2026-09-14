import type React from "react";
import { Button } from "../../components/Button";

export interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRestoreDefault: () => void;
  disabled?: boolean;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  value,
  onChange,
  onRestoreDefault,
  disabled = false,
}) => {
  return (
    <div className="editor-card">
      <div className="editor-header">
        <span className="editor-title">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Prompt del Tutor Feynman
        </span>
        <div className="editor-actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={onRestoreDefault}
            disabled={disabled}
            title="Restaurar el prompt predeterminado"
          >
            Restaurar default
          </Button>
        </div>
      </div>
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe las instrucciones pedagógicas para el tutor Feynman..."
        disabled={disabled}
        spellCheck={false}
      />
    </div>
  );
};
