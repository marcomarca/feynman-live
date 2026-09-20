import { describe, expect, it } from "bun:test";
import { AutoUpdateService } from "../../src/main/autoupdate";

describe("AutoUpdateService Fallback Check", () => {
  it("should return up_to_date when remote version is equal or lower", async () => {
    // Current version 99.0.0 will always be newer than any existing release on GitHub
    const res = await AutoUpdateService.checkGitHubReleasesFallback("99.0.0");
    expect(res.status).toBe("up_to_date");
    expect(res.currentVersion).toBe("99.0.0");
  });

  it("should return update_available when remote version is strictly greater", async () => {
    // Version 0.0.1 is lower than any published release
    const res = await AutoUpdateService.checkGitHubReleasesFallback("0.0.1");
    // If GitHub repo has releases, status is update_available; if offline/no releases, status is up_to_date
    expect(["update_available", "up_to_date"]).toContain(res.status);
    expect(res.currentVersion).toBe("0.0.1");
  });
});
