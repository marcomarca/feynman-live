import type React from "react";
import { useState } from "react";
import type { ChatSessionMeta } from "../../domain/chat";
import { Button } from "./Button";

interface ChatSidebarProps {
  chats: ChatSessionMeta[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
  onOpenFallback: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSettings,
  onOpenFallback,
}) => {
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChatToDelete(id);
  };

  const confirmDelete = () => {
    if (chatToDelete) {
      onDeleteChat(chatToDelete);
      setChatToDelete(null);
    }
  };

  const cancelDelete = () => {
    setChatToDelete(null);
  };

  return (
    <aside className="chat-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img
            src="./brand-icon.png"
            alt="Feynman Live Logo"
            width="22"
            height="22"
            style={{ borderRadius: "5px", objectFit: "contain" }}
          />
          <span className="brand-title">Feynman Live</span>
        </div>

        <button
          type="button"
          className="new-chat-btn"
          onClick={onNewChat}
          title="Crear nueva conversación"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            role="img"
            aria-label="Nuevo"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Nuevo Chat</span>
        </button>
      </div>

      <div className="sidebar-section-title">Historial de Conversaciones</div>

      <div className="sidebar-chat-list">
        {chats.length === 0 ? (
          <div className="empty-chats-notice">
            <p>Sin conversaciones previas</p>
            <span>Inicia una sesión para guardar tu historial.</span>
          </div>
        ) : (
          chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            const dateStr = new Date(chat.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });

            return (
              <div key={chat.id} className={`chat-item-row ${isActive ? "active-chat" : ""}`}>
                <button
                  type="button"
                  className="chat-item-select-btn"
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="chat-item-info">
                    <span className="chat-item-title">{chat.title || "Sesión de Estudio"}</span>
                    <span className="chat-item-meta">
                      {dateStr} • {chat.messageCount} msgs
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="delete-chat-btn"
                  onClick={(e) => handleDeleteClick(e, chat.id)}
                  title="Eliminar chat y sus audios"
                  aria-label="Eliminar chat"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    role="img"
                    aria-label="Eliminar"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Delete confirmation modal */}
      {chatToDelete && (
        <div className="modal-backdrop">
          <div className="confirm-delete-modal">
            <h3>¿Eliminar conversación?</h3>
            <p>
              Esta acción borrará permanentemente los mensajes y todos los archivos de audio
              asociados a esta sesión en AppData.
            </p>
            <div className="confirm-delete-actions">
              <Button variant="secondary" onClick={cancelDelete}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmDelete}>
                Eliminar definitivamente
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={onOpenSettings}
          title="Configuración de API y Voz"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            role="img"
            aria-label="Configuración"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Ajustes</span>
        </button>

        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={onOpenFallback}
          title="Modo Respaldo y Exportar Prompt"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            role="img"
            aria-label="Respaldo"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>Respaldo</span>
        </button>
      </div>
    </aside>
  );
};
