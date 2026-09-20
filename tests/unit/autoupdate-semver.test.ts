import { describe, expect, it } from "bun:test";
import { AutoUpdateService } from "../../src/main/autoupdate";

describe("AutoUpdateService SemVer Comparison", () => {
  it("should return 1 when remote version is higher than local version", () => {
    expect(AutoUpdateService.compareSemver("0.1.2", "0.1.1")).toBe(1);
    expect(AutoUpdateService.compareSemver("0.2.0", "0.1.9")).toBe(1);
    expect(AutoUpdateService.compareSemver("1.0.0", "0.9.9")).toBe(1);
  });

  it("should return -1 when remote version is lower than local version", () => {
    expect(AutoUpdateService.compareSemver("0.1.0", "0.1.1")).toBe(-1);
    expect(AutoUpdateService.compareSemver("0.1.5", "0.2.0")).toBe(-1);
    expect(AutoUpdateService.compareSemver("1.0.0", "2.0.0")).toBe(-1);
  });

  it("should return 0 when versions are equivalent", () => {
    expect(AutoUpdateService.compareSemver("0.1.1", "0.1.1")).toBe(0);
    expect(AutoUpdateService.compareSemver("v0.1.1", "0.1.1")).toBe(0);
    expect(AutoUpdateService.compareSemver("0.1.1", "v0.1.1")).toBe(0);
    expect(AutoUpdateService.compareSemver("v1.2.3", "v1.2.3")).toBe(0);
  });

  it("should handle single or two-digit version fragments safely", () => {
    expect(AutoUpdateService.compareSemver("1.0", "1.0.0")).toBe(0);
    expect(AutoUpdateService.compareSemver("1.1", "1.0")).toBe(1);
    expect(AutoUpdateService.compareSemver("1", "2")).toBe(-1);
  });
});
