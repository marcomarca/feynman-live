import { describe, expect, it } from "bun:test";
import { ExternalProviderLauncher } from "../../src/adapters/desktop/ExternalProviderLauncher";
import { ALLOWED_EXTERNAL_PROVIDERS } from "../../src/shared/constants";

describe("ExternalProviderLauncher", () => {
  const launcher = new ExternalProviderLauncher();

  it("should provide exact official URLs for allowed providers", () => {
    expect(launcher.getProviderUrl("google-ai-studio")).toBe(
      ALLOWED_EXTERNAL_PROVIDERS["google-ai-studio"],
    );
    expect(launcher.getProviderUrl("chatgpt")).toBe(ALLOWED_EXTERNAL_PROVIDERS.chatgpt);
  });

  it("should contain gemini-3.1-flash-live-preview in google AI Studio URL", () => {
    const aiStudioUrl = launcher.getProviderUrl("google-ai-studio");
    expect(aiStudioUrl).toContain("gemini-3.1-flash-live-preview");
  });
});
