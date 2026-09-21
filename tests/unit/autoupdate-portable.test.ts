import { describe, expect, it } from "bun:test";
import { AutoUpdateService } from "../../src/main/autoupdate";

describe("AutoUpdateService Portable In-Place Updater", () => {
  it("should generate a robust portable updater batch script", () => {
    const targetExe = "D:\\apps\\Feynman Live.exe";
    const newExe = "C:\\Users\\User\\AppData\\Local\\Temp\\feynman-update.exe";
    const pid = 12345;

    const script = AutoUpdateService.generatePortableUpdaterScript(targetExe, newExe, pid);

    expect(script).toContain("PID=12345");
    expect(script).toContain("TARGET_EXE=D:\\apps\\Feynman Live.exe");
    expect(script).toContain("NEW_EXE=C:\\Users\\User\\AppData\\Local\\Temp\\feynman-update.exe");
    expect(script).toContain('tasklist /fi "PID eq %PID%"');
    expect(script).toContain('copy /y "%NEW_EXE%" "%TARGET_EXE%"');
    expect(script).toContain(":copy_loop");
    expect(script).toContain('start "" "%TARGET_EXE%"');
    expect(script).toContain('(goto) 2>nul & del "%~f0"');
  });

  it("should detect portable executable path from environment variable", () => {
    const orig = process.env.PORTABLE_EXECUTABLE_FILE;
    try {
      process.env.PORTABLE_EXECUTABLE_FILE = "D:\\MyPrograms\\FeynmanPortable.exe";
      expect(AutoUpdateService.getPortableExecutablePath()).toBe(
        "D:\\MyPrograms\\FeynmanPortable.exe",
      );
    } finally {
      process.env.PORTABLE_EXECUTABLE_FILE = orig;
    }
  });

  it("should identify portable mode from PORTABLE_EXECUTABLE_FILE as well", () => {
    const origDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const origFile = process.env.PORTABLE_EXECUTABLE_FILE;
    try {
      process.env.PORTABLE_EXECUTABLE_DIR = "";
      process.env.PORTABLE_EXECUTABLE_FILE = "";
      expect(AutoUpdateService.isPortable()).toBe(false);

      process.env.PORTABLE_EXECUTABLE_FILE = "C:\\Apps\\Feynman.exe";
      expect(AutoUpdateService.isPortable()).toBe(true);
    } finally {
      process.env.PORTABLE_EXECUTABLE_DIR = origDir;
      process.env.PORTABLE_EXECUTABLE_FILE = origFile;
    }
  });

  it("should correctly compare semantic versions", () => {
    expect(AutoUpdateService.compareSemver("0.1.9", "0.1.8")).toBe(1);
    expect(AutoUpdateService.compareSemver("v0.1.9", "0.1.8")).toBe(1);
    expect(AutoUpdateService.compareSemver("0.1.8", "0.1.9")).toBe(-1);
    expect(AutoUpdateService.compareSemver("0.1.8", "0.1.8")).toBe(0);
    expect(AutoUpdateService.compareSemver("1.0.0", "0.9.9")).toBe(1);
  });
});
