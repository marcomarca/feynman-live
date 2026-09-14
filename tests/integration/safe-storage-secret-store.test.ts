import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SafeStorageSecretStore } from "../../src/adapters/persistence/SafeStorageSecretStore";

describe("SafeStorageSecretStore (Integration / Mock Fallback)", () => {
  let tempBaseDir: string;
  let secretStore: SafeStorageSecretStore;

  beforeEach(async () => {
    tempBaseDir = await mkdtemp(join(tmpdir(), "feynman-secret-test-"));
    secretStore = new SafeStorageSecretStore(tempBaseDir);
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  it("should report false when no key exists", async () => {
    const hasKey = await secretStore.hasGeminiApiKey();
    expect(hasKey).toBe(false);

    const key = await secretStore.getGeminiApiKey();
    expect(key).toBeNull();
  });

  it("should encrypt, save, and decrypt API key", async () => {
    const testKey = "AIzaSyD-1234567890abcdefghijklmnopqrstuv";
    const saveRes = await secretStore.saveGeminiApiKey(testKey);
    expect(saveRes.ok).toBe(true);

    const hasKey = await secretStore.hasGeminiApiKey();
    expect(hasKey).toBe(true);

    const retrieved = await secretStore.getGeminiApiKey();
    expect(retrieved).toBe(testKey);
  });

  it("should delete API key cleanly", async () => {
    await secretStore.saveGeminiApiKey("AIzaSyTestKey");
    const delRes = await secretStore.deleteGeminiApiKey();
    expect(delRes.ok).toBe(true);

    const hasKey = await secretStore.hasGeminiApiKey();
    expect(hasKey).toBe(false);
  });
});
