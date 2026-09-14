import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatHistoryStore } from "../../src/adapters/persistence/ChatHistoryStore";

describe("ChatHistoryStore (Integration)", () => {
  let tempBaseDir: string;
  let chatStore: ChatHistoryStore;

  beforeEach(async () => {
    tempBaseDir = await mkdtemp(join(tmpdir(), "feynman-chat-test-"));
    chatStore = new ChatHistoryStore(tempBaseDir);
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  it("should create a chat, add messages with audio, and reload them accurately", async () => {
    const created = await chatStore.createChat({
      title: "Mecánica Cuántica",
      tutorPrompt: "Sé un tutor socrático",
      studyMaterial: "Principio de incertidumbre de Heisenberg",
      voice: "Zephyr",
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Mecánica Cuántica");

    // Add user message with mock PCM audio (16kHz, 500ms = 16000 bytes)
    const userPcm = new Uint8Array(16000);
    const userMsgRes = await chatStore.addMessage(
      created.id,
      {
        role: "user",
        text: "¿Por qué no podemos medir posición y momento con precisión absoluta?",
      },
      { bytes: userPcm, sampleRate: 16000 },
    );

    expect(userMsgRes.ok).toBe(true);
    if (userMsgRes.ok) {
      expect(userMsgRes.value.audioFileName).toBeTruthy();
      expect(userMsgRes.value.audioDurationMs).toBe(500);
      expect(userMsgRes.value.audioBase64).toContain("data:audio/wav;base64,");
    }

    // Add model reply with mock PCM audio (24kHz, 1000ms = 48000 bytes)
    const modelPcm = new Uint8Array(48000);
    const modelMsgRes = await chatStore.addMessage(
      created.id,
      {
        role: "model",
        text: "Porque las partículas subatómicas se comportan también como ondas probabilísticas.",
      },
      { bytes: modelPcm, sampleRate: 24000 },
    );

    expect(modelMsgRes.ok).toBe(true);
    if (modelMsgRes.ok) {
      expect(modelMsgRes.value.audioDurationMs).toBe(1000);
    }

    // Reload from store
    const reloaded = await chatStore.getChat(created.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.messages.length).toBe(2);
    expect(reloaded?.messages[0].text).toContain("posición y momento");
    expect(reloaded?.messages[0].audioBase64).toBeTruthy();
    expect(reloaded?.messages[1].text).toContain("ondas probabilísticas");
  });

  it("should list chats ordered by updatedAt descending", async () => {
    const chat1 = await chatStore.createChat({
      title: "Chat 1",
      tutorPrompt: "",
      studyMaterial: "",
      voice: "Zephyr",
    });

    const chat2 = await chatStore.createChat({
      title: "Chat 2",
      tutorPrompt: "",
      studyMaterial: "",
      voice: "Zephyr",
    });

    // Update chat 1 with a new message so it becomes the latest
    await chatStore.addMessage(chat1.id, {
      role: "user",
      text: "Nuevo mensaje",
    });

    const list = await chatStore.listChats();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(chat1.id);
    expect(list[1].id).toBe(chat2.id);
  });

  it("should delete a chat and all its audio files completely", async () => {
    const chat = await chatStore.createChat({
      title: "Chat Para Borrar",
      tutorPrompt: "",
      studyMaterial: "",
      voice: "Zephyr",
    });

    await chatStore.addMessage(
      chat.id,
      { role: "user", text: "Mensaje con audio" },
      { bytes: new Uint8Array(3200), sampleRate: 16000 },
    );

    const deleteRes = await chatStore.deleteChat(chat.id);
    expect(deleteRes.ok).toBe(true);

    const fetched = await chatStore.getChat(chat.id);
    expect(fetched).toBeNull();

    const list = await chatStore.listChats();
    expect(list.find((c) => c.id === chat.id)).toBeUndefined();
  });

  it("should export full chat to formatted markdown", async () => {
    const chat = await chatStore.createChat({
      title: "Entropía y Termodinámica",
      tutorPrompt: "Tutor Feynman",
      studyMaterial: "Segunda ley de la termodinámica",
      voice: "Zephyr",
    });

    await chatStore.addMessage(chat.id, {
      role: "user",
      text: "Explícame la entropía como si fuera un desorden en una habitación.",
    });

    await chatStore.addMessage(chat.id, {
      role: "model",
      text: "Imagina que ordenar tu habitación requiere energía, pero desordenarla ocurre de forma natural.",
    });

    const md = await chatStore.exportChatAsMarkdown(chat.id);
    expect(md).toContain("# Entropía y Termodinámica");
    expect(md).toContain("Segunda ley de la termodinámica");
    expect(md).toContain("**Usuario**");
    expect(md).toContain("**Tutor (Modelo)**");
  });
});
