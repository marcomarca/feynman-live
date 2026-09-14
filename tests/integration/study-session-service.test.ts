import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  LiveConnectInput,
  LiveTutorProvider,
} from "../../src/adapters/gemini/GeminiLiveAdapter";
import { AppDataStore } from "../../src/adapters/persistence/AppDataStore";
import { ChatHistoryStore } from "../../src/adapters/persistence/ChatHistoryStore";
import { SafeStorageSecretStore } from "../../src/adapters/persistence/SafeStorageSecretStore";
import { type AppError, createAppError } from "../../src/domain/app-error";
import { DEFAULT_APP_SETTINGS } from "../../src/domain/app-settings";
import type { ChatMessage } from "../../src/domain/chat";
import { type Result, ok } from "../../src/domain/result";
import { StudySessionService } from "../../src/services/StudySessionService";

class FakeLiveTutorProvider implements LiveTutorProvider {
  connected = false;
  sentAudioChunks: Uint8Array[] = [];
  sentTexts: string[] = [];
  lastConnectInput: LiveConnectInput | null = null;

  private audioListeners: Set<(chunk: Uint8Array) => void> = new Set();
  private textDeltaListeners: Set<(delta: string) => void> = new Set();
  private userTranscriptionListeners: Set<(text: string) => void> = new Set();
  private turnCompleteListeners: Set<() => void> = new Set();
  private interruptedListeners: Set<() => void> = new Set();
  private errorListeners: Set<(error: AppError) => void> = new Set();
  private closeListeners: Set<() => void> = new Set();

  isConnected(): boolean {
    return this.connected;
  }

  async connect(input: LiveConnectInput): Promise<Result<void, AppError>> {
    this.connected = true;
    this.lastConnectInput = input;
    return ok(undefined);
  }

  sendAudio(chunk: Uint8Array): void {
    this.sentAudioChunks.push(chunk);
  }

  sendText(text: string): void {
    this.sentTexts.push(text);
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  onAudioChunk(listener: (chunk: Uint8Array) => void): () => void {
    this.audioListeners.add(listener);
    return () => this.audioListeners.delete(listener);
  }

  onTextDelta(listener: (delta: string) => void): () => void {
    this.textDeltaListeners.add(listener);
    return () => this.textDeltaListeners.delete(listener);
  }

  onUserTranscription(listener: (text: string) => void): () => void {
    this.userTranscriptionListeners.add(listener);
    return () => this.userTranscriptionListeners.delete(listener);
  }

  onTurnComplete(listener: () => void): () => void {
    this.turnCompleteListeners.add(listener);
    return () => this.turnCompleteListeners.delete(listener);
  }

  onInterrupted(listener: () => void): () => void {
    this.interruptedListeners.add(listener);
    return () => this.interruptedListeners.delete(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  // Simulation helpers
  emitAudio(chunk: Uint8Array): void {
    for (const l of this.audioListeners) l(chunk);
  }

  emitTextDelta(delta: string): void {
    for (const l of this.textDeltaListeners) l(delta);
  }

  emitUserTranscription(text: string): void {
    for (const l of this.userTranscriptionListeners) l(text);
  }

  emitTurnComplete(): void {
    for (const l of this.turnCompleteListeners) l();
  }

  emitInterrupted(): void {
    for (const l of this.interruptedListeners) l();
  }

  emitError(err: AppError): void {
    for (const l of this.errorListeners) l(err);
  }
}

describe("StudySessionService (Integration)", () => {
  let tempBaseDir: string;
  let dataStore: AppDataStore;
  let secretStore: SafeStorageSecretStore;
  let chatStore: ChatHistoryStore;
  let fakeProvider: FakeLiveTutorProvider;
  let sessionService: StudySessionService;

  beforeEach(async () => {
    tempBaseDir = await mkdtemp(join(tmpdir(), "feynman-session-test-"));
    dataStore = new AppDataStore(tempBaseDir);
    secretStore = new SafeStorageSecretStore(tempBaseDir);
    chatStore = new ChatHistoryStore(tempBaseDir);
    fakeProvider = new FakeLiveTutorProvider();
    sessionService = new StudySessionService(dataStore, secretStore, fakeProvider, chatStore);
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  it("should fail with AUTH_MISSING if no API key is saved", async () => {
    const res = await sessionService.start();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("AUTH_MISSING");
    }
    expect(sessionService.getState().status).toBe("error");
  });

  it("should transition to listening when API key is present and connection succeeds", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    const res = await sessionService.start();

    expect(res.ok).toBe(true);
    expect(sessionService.getState().status).toBe("listening");
    expect(sessionService.getCurrentChatId()).toBeTruthy();
  });

  it("should route live text message and save it to current chat", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    const completedMessages: ChatMessage[] = [];
    sessionService.onMessageComplete((msg) => completedMessages.push(msg));

    const textRes = sessionService.sendText("¿Puedes darme un ejemplo más simple?");
    expect(textRes.ok).toBe(true);
    expect(fakeProvider.sentTexts).toContain("¿Puedes darme un ejemplo más simple?");

    expect(completedMessages.length).toBe(1);
    expect(completedMessages[0].role).toBe("user");
    expect(completedMessages[0].text).toBe("¿Puedes darme un ejemplo más simple?");
    expect(completedMessages[0].audioBase64).toBeUndefined();
  });

  it("should not create a phantom user message when model responds after a text message", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    const completedMessages: ChatMessage[] = [];
    sessionService.onMessageComplete((msg) => completedMessages.push(msg));

    // Simulate ambient microphone sending background noise
    sessionService.sendAudio(new Uint8Array(1600));

    // User types and sends text
    sessionService.sendText("vale lo intento");
    expect(completedMessages.length).toBe(1);
    expect(completedMessages[0].role).toBe("user");
    expect(completedMessages[0].text).toBe("vale lo intento");
    expect(completedMessages[0].audioBase64).toBeUndefined();

    // Model responds with audio and text deltas
    fakeProvider.emitAudio(new Uint8Array(2400));
    fakeProvider.emitTextDelta("¡Genial! Pruébalo y me cuentas.");
    fakeProvider.emitTurnComplete();

    // Exactly 2 messages total: 1 user text and 1 model response (no phantom user block)
    expect(completedMessages.length).toBe(2);
    expect(completedMessages[1].role).toBe("model");
    expect(completedMessages[1].text).toBe("¡Genial! Pruébalo y me cuentas.");
  });

  it("should discard background ambient audio when user has not spoken", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    const completedMessages: ChatMessage[] = [];
    sessionService.onMessageComplete((msg) => completedMessages.push(msg));

    // Background noise without any user transcription
    sessionService.sendAudio(new Uint8Array(1600));

    // Model speaks
    fakeProvider.emitAudio(new Uint8Array(2400));
    fakeProvider.emitTextDelta("¿En qué te puedo ayudar?");
    fakeProvider.emitTurnComplete();

    // Only 1 message (the model message), no ghost user message
    expect(completedMessages.length).toBe(1);
    expect(completedMessages[0].role).toBe("model");
    expect(completedMessages[0].text).toBe("¿En qué te puedo ayudar?");
  });

  it("should stream model text deltas and save completed model message on turnComplete", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    const deltas: string[] = [];
    const completedMessages: ChatMessage[] = [];
    sessionService.onTextDelta((d) => deltas.push(d));
    sessionService.onMessageComplete((m) => completedMessages.push(m));

    // Model speaks audio and text
    fakeProvider.emitAudio(new Uint8Array(2400));
    fakeProvider.emitTextDelta("Claro, ");
    fakeProvider.emitTextDelta("aquí tienes un ejemplo.");
    expect(sessionService.getState().status).toBe("speaking");

    fakeProvider.emitTurnComplete();
    expect(sessionService.getState().status).toBe("listening");

    expect(deltas.join("")).toBe("Claro, aquí tienes un ejemplo.");
    expect(completedMessages.length).toBe(1);
    expect(completedMessages[0].role).toBe("model");
    expect(completedMessages[0].text).toBe("Claro, aquí tienes un ejemplo.");
    expect(completedMessages[0].audioBase64).toContain("data:audio/wav;base64,");
  });

  it("should capture user voice audio and transcribe speech into message", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    const completedMessages: ChatMessage[] = [];
    sessionService.onMessageComplete((msg) => completedMessages.push(msg));

    // User sends audio chunks
    sessionService.sendAudio(new Uint8Array(3200));
    // User transcription arrives
    fakeProvider.emitUserTranscription("Explícame qué es la gravedad");

    // Model starts speaking (flushes user turn)
    fakeProvider.emitAudio(new Uint8Array(2400));
    expect(completedMessages.length).toBe(1);
    expect(completedMessages[0].role).toBe("user");
    expect(completedMessages[0].text).toBe("Explícame qué es la gravedad");
    expect(completedMessages[0].audioBase64).toContain("data:audio/wav;base64,");
  });

  it("should resume existing chat and pass prior conversation history to provider by default", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");

    // Pre-create chat with existing messages
    const chat = await chatStore.createChat({
      tutorPrompt: "Eres mi tutor",
      studyMaterial: "Capítulo 1 de Física",
      voice: "Puck",
    });

    await chatStore.addMessage(chat.id, {
      role: "user",
      text: "¿Qué es la primera ley de Newton?",
    });

    await chatStore.addMessage(chat.id, {
      role: "model",
      text: "La primera ley dice que un objeto mantiene su estado de movimiento a menos que actúe una fuerza.",
    });

    // Start session with this chat
    const res = await sessionService.start(chat.id);
    expect(res.ok).toBe(true);

    expect(fakeProvider.lastConnectInput).not.toBeNull();
    expect(fakeProvider.lastConnectInput?.studyMaterial).toBe("Capítulo 1 de Física");
    expect(fakeProvider.lastConnectInput?.conversationHistory?.length).toBe(2);
    expect(fakeProvider.lastConnectInput?.conversationHistory?.[0].text).toBe(
      "¿Qué es la primera ley de Newton?",
    );
  });

  it("should allow disabling conversation history when explicitly requested", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");

    const chat = await chatStore.createChat({
      tutorPrompt: "Eres mi tutor",
      studyMaterial: "Capítulo 1",
      voice: "Puck",
    });

    await chatStore.addMessage(chat.id, {
      role: "user",
      text: "Hola anterior",
    });

    // Start session with includeHistory: false
    const res = await sessionService.start(chat.id, { includeHistory: false });
    expect(res.ok).toBe(true);

    expect(fakeProvider.lastConnectInput?.conversationHistory?.length).toBe(0);
  });

  it("should pass responseModality setting to provider", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await dataStore.saveSettings({ ...DEFAULT_APP_SETTINGS, responseModality: "TEXT" });

    const res = await sessionService.start();
    expect(res.ok).toBe(true);
    expect(fakeProvider.lastConnectInput?.responseModality).toBe("TEXT");
  });

  it("should stop session cleanly", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();
    await sessionService.stop();

    expect(sessionService.getState().status).toBe("idle");
    expect(fakeProvider.connected).toBe(false);
  });
});
