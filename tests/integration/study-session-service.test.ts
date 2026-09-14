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
import { SafeStorageSecretStore } from "../../src/adapters/persistence/SafeStorageSecretStore";
import { type AppError, createAppError } from "../../src/domain/app-error";
import { type Result, ok } from "../../src/domain/result";
import { StudySessionService } from "../../src/services/StudySessionService";

class FakeLiveTutorProvider implements LiveTutorProvider {
  connected = false;
  sentAudioChunks: Uint8Array[] = [];
  sentTexts: string[] = [];

  private audioListeners: Set<(chunk: Uint8Array) => void> = new Set();
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
  let fakeProvider: FakeLiveTutorProvider;
  let sessionService: StudySessionService;

  beforeEach(async () => {
    tempBaseDir = await mkdtemp(join(tmpdir(), "feynman-session-test-"));
    dataStore = new AppDataStore(tempBaseDir);
    secretStore = new SafeStorageSecretStore(tempBaseDir);
    fakeProvider = new FakeLiveTutorProvider();
    sessionService = new StudySessionService(dataStore, secretStore, fakeProvider);
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
  });

  it("should route live text message without interrupting audio session", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    const textRes = sessionService.sendText("¿Puedes darme un ejemplo más simple?");
    expect(textRes.ok).toBe(true);
    expect(fakeProvider.sentTexts).toContain("¿Puedes darme un ejemplo más simple?");
    expect(sessionService.getState().status).toBe("listening");
  });

  it("should transition to speaking on audio chunk and back to listening on interruption", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();

    // Model speaks
    fakeProvider.emitAudio(new Uint8Array([1, 2, 3]));
    expect(sessionService.getState().status).toBe("speaking");

    // User interrupts (barge-in)
    fakeProvider.emitInterrupted();
    expect(sessionService.getState().status).toBe("listening");
  });

  it("should handle quota exhaustion error without losing user content", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await dataStore.saveStudyMaterial("Material valioso que no debe perderse");
    await sessionService.start();

    fakeProvider.emitError(createAppError("QUOTA_EXHAUSTED", "Cuota agotada", undefined, false));

    const state = sessionService.getState();
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.error.code).toBe("QUOTA_EXHAUSTED");
    }

    const materialAfter = await dataStore.loadStudyMaterial();
    expect(materialAfter).toBe("Material valioso que no debe perderse");
  });

  it("should stop session cleanly", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyValidKey");
    await sessionService.start();
    await sessionService.stop();

    expect(sessionService.getState().status).toBe("idle");
    expect(fakeProvider.connected).toBe(false);
  });
});
