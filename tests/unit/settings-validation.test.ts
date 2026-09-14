import { describe, expect, it } from "bun:test";
import { DEFAULT_APP_SETTINGS } from "../../src/domain/app-settings";
import {
  AVAILABLE_THINKING_LEVELS,
  AVAILABLE_VOICES,
  GEMINI_LIVE_MODEL,
} from "../../src/shared/constants";

describe("Settings and Defaults", () => {
  it("should have correct default settings", () => {
    expect(DEFAULT_APP_SETTINGS.version).toBe(1);
    expect(DEFAULT_APP_SETTINGS.model).toBe(GEMINI_LIVE_MODEL);
    expect(DEFAULT_APP_SETTINGS.thinkingLevel).toBe("minimal");
    expect(DEFAULT_APP_SETTINGS.voice).toBe("Zephyr");
    expect(DEFAULT_APP_SETTINGS.responseModality).toBe("AUDIO");
    expect(DEFAULT_APP_SETTINGS.globalShortcut).toBe("CommandOrControl+Shift+Space");
    expect(DEFAULT_APP_SETTINGS.launchAtLogin).toBe(false);
  });

  it("should include standard voices and thinking levels", () => {
    expect(AVAILABLE_VOICES).toContain("Zephyr");
    expect(AVAILABLE_VOICES).toContain("Puck");
    expect(AVAILABLE_THINKING_LEVELS).toContain("minimal");
    expect(AVAILABLE_THINKING_LEVELS).toContain("high");
  });
});
