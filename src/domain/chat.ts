export type ChatRole = "user" | "model";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  audioFileName?: string;
  audioDurationMs?: number;
  audioBase64?: string;
  timestamp: number;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tutorPrompt: string;
  studyMaterial: string;
  voice: string;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
}

export interface CreateChatInput {
  title?: string;
  tutorPrompt: string;
  studyMaterial: string;
  voice: string;
}

export interface UpdateChatInput {
  title?: string;
  tutorPrompt?: string;
  studyMaterial?: string;
}
