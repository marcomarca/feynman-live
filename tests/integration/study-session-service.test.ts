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
import type { ChatMessage } from "../../src/domain/chat";
import { type Result, ok } from "../../src/domain/result";
import { StudySessionService } from "../../src/services/StudySessionService";

class FakeLiveTutorProvider implements LiveTutorProvider {
  connected = false;
  sentAudioChunks: Uint8Array[] = [];
  sentTexts: string[] = [];

  private audioListeners: Set<(chunk: Uint8Array) => void> = new Set();
  private textDeltaListeners: Set<(delta: string) => void> = new Set();
  private turnCompleteListeners: Set<() => void> = new Set();
  private interruptedListeners: Set<() => void> = new Set();
  private errorListeners: Set<(error: AppError) => void> = new Set();
  private closeListeners: Set<() => void> = new Set();

  isConnected(): boolean {
    return this.connected;
  }

  async connect(_input: LiveConnectInput): Promise<Result<void, AppError>> {
    this.connected = true;
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
  });

  it("should stop session cleanly", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();
    await sessionService.stop();

    expect(sessionService.getState().status).toBe("idle");
    expect(fakeProvider.connected).toBe(false);
  });
});
