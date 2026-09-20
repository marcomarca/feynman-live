import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const localAppData = process.env.LOCALAPPDATA || "";
const sdkAdb = join(localAppData, "Android", "Sdk", "platform-tools", "adb.exe");
const adbPath = existsSync(sdkAdb) ? sdkAdb : "adb";
const androidDir = join(__dirname, "..", "android");
const gradlewCmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

console.log("\n[Android Debug] 1/2 Compilando e instalando APK en modo depuración...");
const installResult = spawnSync(gradlewCmd, ["installDebug"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});

if (installResult.status !== 0) {
  console.error("\n[Error] Falló la instalación de depuración de Android.");
  process.exit(installResult.status || 1);
}

console.log("\n[Android Debug] 2/2 Lanzando actividad principal en el dispositivo...");
const launchResult = spawnSync(
  adbPath,
  ["shell", "am", "start", "-S", "-n", "com.feynmanlive.app/.MainActivity"],
  {
    stdio: "inherit",
    shell: true,
  }
);

if (launchResult.status === 0) {
  console.log("\n[Android Debug] Aplicación iniciada exitosamente en el dispositivo.\n");
}
