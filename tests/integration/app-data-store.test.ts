import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppDataStore } from "../../src/adapters/persistence/AppDataStore";
import { DEFAULT_TUTOR_PROMPT } from "../../src/shared/constants";

describe("AppDataStore (Integration)", () => {
  let tempBaseDir: string;
  let store: AppDataStore;

  beforeEach(async () => {
    tempBaseDir = await mkdtemp(join(tmpdir(), "feynman-test-"));
    store = new AppDataStore(tempBaseDir);
  });

  afterEach(() => {
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  it("should create app-data directory and initialize default prompt", async () => {
    const prompt = await store.loadTutorPrompt();
    expect(prompt).toBe(DEFAULT_TUTOR_PROMPT);
  });

  it("should save and reload modified tutor prompt", async () => {
    const customPrompt = "Mi prompt personalizado de tutor Feynman";
    const saveRes = await store.saveTutorPrompt(customPrompt);
    expect(saveRes.ok).toBe(true);

    const reloaded = await store.loadTutorPrompt();
    expect(reloaded).toBe(customPrompt);
  });

  it("should save and reload study material", async () => {
    const material = "# Concepto: Entropía\nLa entropía es una medida del desorden...";
    const saveRes = await store.saveStudyMaterial(material);
    expect(saveRes.ok).toBe(true);

    const reloaded = await store.loadStudyMaterial();
    expect(reloaded).toBe(material);
  });

  it("should restore default prompt", async () => {
    await store.saveTutorPrompt("Texto temporal");
    const restored = await store.restoreDefaultTutorPrompt();
    expect(restored).toBe(DEFAULT_TUTOR_PROMPT);

    const reloaded = await store.loadTutorPrompt();
    expect(reloaded).toBe(DEFAULT_TUTOR_PROMPT);
  });

  it("should export compiled prompt to arbitrary file path", async () => {
    const exportPath = join(tempBaseDir, "exported-prompt.md");
    const content = "# Exported Prompt Content";
    const exportRes = await store.exportToFile(exportPath, content);

    expect(exportRes.ok).toBe(true);
    expect(existsSync(exportPath)).toBe(true);
  });
});
