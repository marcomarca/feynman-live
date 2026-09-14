import type React from "react";
import { Button } from "../../components/Button";

export interface MaterialEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export const MaterialEditor: React.FC<MaterialEditorProps> = ({
  value,
  onChange,
  onClear,
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
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Material de Estudio
        </span>
        <div className="editor-actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={onClear}
            disabled={disabled || !value}
            title="Limpiar material de estudio"
          >
            Limpiar
          </Button>
        </div>
      </div>
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega aquí el texto, apuntes, conceptos o tema que deseas aprender con el tutor..."
        disabled={disabled}
        spellCheck={false}
      />
    </div>
  );
};
