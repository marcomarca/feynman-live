import { spawn } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import type { UpdateCheckResult, UpdateDownloadProgress } from "../shared/ipc-contract";
import type { AppLogger } from "../shared/logger";

let loggerInstance: AppLogger | null = null;
let isInitialized = false;
let updateDownloading = false;
let updateDownloaded = false;
let downloadedVersion: string | null = null;
let downloadedFilePath: string | null = null;
let downloadProgress: UpdateDownloadProgress | null = null;
let cachedLatestCheck: UpdateCheckResult | null = null;
let mainWindowGetter: (() => BrowserWindow | null) | null = null;

/**
 * Helper para obtener electron de forma segura en entornos de ejecución.
 */
function getElectron(): typeof import("electron") | null {
  try {
    return require("electron");
  } catch {
    return null;
  }
}

/**
 * Emite cambios de estado al renderer si la ventana principal está abierta.
 */
function emitStatusChanged(result: UpdateCheckResult): void {
  const win = mainWindowGetter ? mainWindowGetter() : null;
  if (win && !win.isDestroyed()) {
    win.webContents.send("autoupdate:statusChanged", result);
  }
}

/**
 * Comprueba si la aplicación se está ejecutando en modo Portable.
 * Electron Builder establece PORTABLE_EXECUTABLE_DIR o PORTABLE_EXECUTABLE_FILE al lanzar el ejecutable portable.
 */
export function isPortable(): boolean {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR?.trim();
  const file = process.env.PORTABLE_EXECUTABLE_FILE?.trim();
  return Boolean((dir && dir.length > 0) || (file && file.length > 0));
}

/**
 * Obtiene la ruta física del archivo .exe portable original.
 */
export function getPortableExecutablePath(): string | null {
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return process.env.PORTABLE_EXECUTABLE_FILE;
  }
  const electron = getElectron();
  if (electron?.app?.isPackaged) {
    return process.execPath;
  }
  return null;
}

/**
 * Retorna la información de versión y tipo de empaquetado.
 */
export function getVersionInfo(): { version: string; isPortable: boolean } {
  const electron = getElectron();
  const version = electron?.app ? electron.app.getVersion() : "0.0.0";
  return {
    version,
    isPortable: isPortable(),
  };
}

/**
 * Compara dos versiones siguiendo Semantic Versioning.
 * Retorna 1 si v1 > v2, -1 si v1 < v2, y 0 si son iguales.
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, "").split(".").map(Number);
  const clean2 = v2.replace(/^v/, "").split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Genera el script por lotes .cmd que reemplazará el ejecutable portable en caliente.
 */
export function generatePortableUpdaterScript(
  targetExe: string,
  newExe: string,
  pid: number,
): string {
  return `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "PID=${pid}"
set "TARGET_EXE=${targetExe}"
set "NEW_EXE=${newExe}"

:: 1. Esperar a que el proceso actual termine completamente
:wait_process
tasklist /fi "PID eq %PID%" 2>nul | findstr /i "%PID%" >nul
if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_process
)

:: Breve margen para liberar locks de archivo de Windows
timeout /t 1 /nobreak >nul

:: 2. Reemplazar el ejecutable portable en su ubicacion original con reintentos
set /a RETRIES=0
:copy_loop
copy /y "%NEW_EXE%" "%TARGET_EXE%" >nul 2>&1
if errorlevel 1 (
    set /a RETRIES+=1
    if !RETRIES! leq 15 (
        timeout /t 1 /nobreak >nul
        goto copy_loop
    )
)

:: 3. Limpiar el binario temporal descargado
if exist "%NEW_EXE%" del /f /q "%NEW_EXE%" >nul 2>&1

:: 4. Lanzar la nueva version actualizada
start "" "%TARGET_EXE%"

:: 5. Autodestruccion del script
(goto) 2>nul & del "%~f0"
`;
}

/**
 * Consulta directamente la API de GitHub Releases para verificar versiones.
 */
export async function checkGitHubReleasesFallback(
  currentVersion: string,
): Promise<UpdateCheckResult> {
  const portable = isPortable();

  try {
    const url = "https://api.github.com/repos/marcomarca/feynman-live/releases/latest";

    const data = await new Promise<{
      tag_name?: string;
      html_url?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    }>((resolve, reject) => {
      const req = https.get(url, { headers: { "User-Agent": "FeynmanLive-App" } }, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let raw = "";
        res.on("data", (chunk: Buffer) => {
          raw += chunk.toString("utf-8");
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on("error", reject);
      req.setTimeout(6000, () => req.destroy(new Error("Timeout")));
    });

    const latestTag: string = data.tag_name || "";
    const latestVersion = latestTag.replace(/^v/, "");
    const isNewer = compareSemver(latestVersion, currentVersion) > 0;

    const portableAsset = Array.isArray(data.assets)
      ? data.assets.find(
          (a) =>
            typeof a.name === "string" &&
            (a.name.toLowerCase().includes("portable") ||
              !a.name.toLowerCase().includes("setup")) &&
            a.name.toLowerCase().endsWith(".exe"),
        )
      : undefined;

    const setupAsset = Array.isArray(data.assets)
      ? data.assets.find(
          (a) =>
            typeof a.name === "string" &&
            (a.name.toLowerCase().includes("setup") ||
              a.name.toLowerCase().includes("installer")) &&
            a.name.toLowerCase().endsWith(".exe"),
        )
      : undefined;

    const downloadUrl = portable
      ? portableAsset?.browser_download_url || data.html_url
      : setupAsset?.browser_download_url || data.html_url;

    if (isNewer) {
      const result: UpdateCheckResult = {
        status: "update_available",
        currentVersion,
        latestVersion: latestTag,
        releaseUrl: data.html_url,
        downloadUrl,
        isPortable: portable,
        message: `Nueva versión ${latestTag} disponible para actualizar.`,
      };
      cachedLatestCheck = result;
      return result;
    }

    const upToDateResult: UpdateCheckResult = {
      status: "up_to_date",
      currentVersion,
      latestVersion: latestTag,
      releaseUrl: data.html_url,
      downloadUrl,
      isPortable: portable,
      message: "Ya tienes instalada la versión más reciente de Feynman Live.",
    };
    cachedLatestCheck = upToDateResult;
    return upToDateResult;
  } catch {
    const errorResult: UpdateCheckResult = {
      status: "up_to_date",
      currentVersion,
      isPortable: portable,
      message: "No se encontraron actualizaciones pendientes o no hay conexión con GitHub.",
    };
    return errorResult;
  }
}

/**
 * Descarga la actualización portable en segundo plano hacia %TEMP% con reporte de progreso en vivo.
 */
export async function downloadPortableUpdate(
  assetUrl?: string,
  targetVersion?: string,
): Promise<void> {
  const electron = getElectron();
  const currentVersion = electron?.app ? electron.app.getVersion() : "0.0.0";
  const version = targetVersion || cachedLatestCheck?.latestVersion || "latest";

  if (updateDownloading) {
    loggerInstance?.info("autoupdate", "Descarga de actualización ya en curso.");
    return;
  }

  if (
    updateDownloaded &&
    downloadedVersion === version &&
    downloadedFilePath &&
    fs.existsSync(downloadedFilePath)
  ) {
    emitStatusChanged({
      status: "ready_to_install",
      currentVersion,
      latestVersion: downloadedVersion,
      isPortable: true,
      message: `Actualización ${downloadedVersion} ya descargada y lista para aplicar.`,
    });
    return;
  }

  let finalUrl = assetUrl || cachedLatestCheck?.downloadUrl;
  if (!finalUrl) {
    const check = await checkGitHubReleasesFallback(currentVersion);
    finalUrl = check.downloadUrl;
  }

  if (!finalUrl || !finalUrl.startsWith("http")) {
    emitStatusChanged({
      status: "error",
      currentVersion,
      latestVersion: version,
      isPortable: true,
      message: "No se encontró el enlace de descarga del ejecutable portable.",
    });
    return;
  }

  const tempDir = electron?.app ? electron.app.getPath("temp") : os.tmpdir();
  const tempFile = path.join(tempDir, `feynman-live-v${version.replace(/^v/, "")}-update.exe`);

  updateDownloading = true;
  downloadProgress = { percent: 0, transferredBytes: 0, totalBytes: 0 };

  emitStatusChanged({
    status: "downloading",
    currentVersion,
    latestVersion: version,
    downloadProgress,
    isPortable: true,
    message: "Iniciando descarga de actualización...",
  });

  loggerInstance?.info("autoupdate", `Iniciando descarga de ${finalUrl} hacia ${tempFile}`);

  try {
    const response = await fetch(finalUrl, {
      headers: { "User-Agent": "FeynmanLive-App" },
      redirect: "follow",
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const totalBytes = Number(response.headers.get("content-length")) || 0;
    let transferredBytes = 0;

    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch {}
    }

    const fileStream = fs.createWriteStream(tempFile);
    const reader = response.body.getReader();
    let lastProgressEmit = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        transferredBytes += value.length;

        const percent =
          totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0;
        const now = Date.now();

        if (now - lastProgressEmit > 150 || percent === 100) {
          lastProgressEmit = now;
          downloadProgress = { percent, transferredBytes, totalBytes };
          emitStatusChanged({
            status: "downloading",
            currentVersion,
            latestVersion: version,
            downloadProgress,
            isPortable: true,
            message: `Descargando actualización: ${percent}%`,
          });
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        fileStream.on("error", reject);
        fileStream.end(resolve);
      });
    }

    const stats = fs.statSync(tempFile);
    if (stats.size === 0) {
      throw new Error("El archivo descargado está vacío.");
    }

    updateDownloading = false;
    updateDownloaded = true;
    downloadedVersion = version;
    downloadedFilePath = tempFile;

    loggerInstance?.info(
      "autoupdate",
      `Descarga completada con éxito (${stats.size} bytes): ${tempFile}`,
    );

    const readyResult: UpdateCheckResult = {
      status: "ready_to_install",
      currentVersion,
      latestVersion: downloadedVersion,
      isPortable: true,
      message: `Actualización ${downloadedVersion} descargada y lista para aplicar.`,
    };
    emitStatusChanged(readyResult);

    if (electron?.dialog) {
      electron.dialog
        .showMessageBox({
          type: "info",
          buttons: ["Reiniciar y actualizar", "Más tarde"],
          defaultId: 0,
          cancelId: 1,
          title: "Actualización lista",
          message: "Una nueva versión de Feynman Live ha sido descargada.",
          detail: `La versión ${downloadedVersion} está lista para aplicarse.\n¿Deseas reiniciar la aplicación ahora para completar la actualización?`,
        })
        .then((result) => {
          if (result.response === 0) {
            loggerInstance?.info(
              "autoupdate",
              "Usuario confirmó reinicio inmediato desde cuadro de diálogo.",
            );
            applyPortableUpdateAndRestart();
          } else {
            loggerInstance?.info(
              "autoupdate",
              "Usuario pospuso el reinicio. La actualización podrá aplicarse desde Configuración.",
            );
          }
        })
        .catch(() => {});
    }
  } catch (err: unknown) {
    updateDownloading = false;
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}

    const errorMessage = err instanceof Error ? err.message : String(err);
    loggerInstance?.error("autoupdate", "Error al descargar actualización portable", err);

    emitStatusChanged({
      status: "error",
      currentVersion,
      latestVersion: version,
      isPortable: true,
      message: `Error al descargar la actualización: ${errorMessage}`,
    });
  }
}

/**
 * Ejecuta el protocolo de reemplazo en caliente del ejecutable portable y reinicia.
 */
export function applyPortableUpdateAndRestart(): void {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    loggerInstance?.error(
      "autoupdate",
      "No existe archivo descargado para aplicar la actualización portable.",
    );
    return;
  }

  const targetExe = getPortableExecutablePath();
  if (!targetExe) {
    loggerInstance?.error(
      "autoupdate",
      "No se pudo determinar la ruta del ejecutable portable destino.",
    );
    return;
  }

  const electron = getElectron();
  const tempDir = electron?.app ? electron.app.getPath("temp") : os.tmpdir();
  const scriptPath = path.join(tempDir, "feynman-portable-updater.cmd");

  loggerInstance?.info(
    "autoupdate",
    `Generando script de reemplazo: ${scriptPath} -> ${targetExe}`,
  );

  const scriptContent = generatePortableUpdaterScript(targetExe, downloadedFilePath, process.pid);
  fs.writeFileSync(scriptPath, scriptContent, { encoding: "utf-8" });

  const child = spawn("cmd.exe", ["/c", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  loggerInstance?.info(
    "autoupdate",
    "Script auxiliar lanzado desacoplado. Cerrando la aplicación...",
  );

  if (electron?.app) {
    electron.app.quit();
    setTimeout(() => {
      electron.app.exit(0);
    }, 1200);
  }
}

/**
 * Comprueba manualmente el estado de las actualizaciones.
 */
export async function checkForUpdatesManual(): Promise<UpdateCheckResult> {
  const electron = getElectron();
  const currentVersion = electron?.app ? electron.app.getVersion() : "0.0.0";
  const portable = isPortable();

  if (updateDownloaded) {
    return {
      status: "ready_to_install",
      currentVersion,
      latestVersion: downloadedVersion || currentVersion,
      isPortable: portable,
      message: `Actualización ${downloadedVersion || ""} descargada y lista para aplicar.`,
    };
  }

  if (updateDownloading) {
    return {
      status: "downloading",
      currentVersion,
      latestVersion: downloadedVersion || undefined,
      downloadProgress: downloadProgress || undefined,
      isPortable: portable,
      message: "Descarga de actualización en curso...",
    };
  }

  if (portable || !electron?.app?.isPackaged) {
    const res = await checkGitHubReleasesFallback(currentVersion);
    return {
      ...res,
      isPortable: portable,
    };
  }

  try {
    const { autoUpdater } = await import("electron-updater");

    return new Promise<UpdateCheckResult>((resolve) => {
      let isResolved = false;

      const cleanup = () => {
        autoUpdater.removeListener("update-available", onAvailable);
        autoUpdater.removeListener("update-not-available", onNotAvailable);
        autoUpdater.removeListener("update-downloaded", onDownloaded);
        autoUpdater.removeListener("error", onError);
      };

      const onDownloaded = (info: { version?: string }) => {
        updateDownloaded = true;
        downloadedVersion = info.version || null;
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({
          status: "ready_to_install",
          currentVersion,
          latestVersion: info.version,
          isPortable: false,
          message: "Actualización descargada y lista para instalar.",
        });
      };

      const onAvailable = (info: { version?: string }) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({
          status: "downloading",
          currentVersion,
          latestVersion: info.version,
          isPortable: false,
          message: "Hay una nueva versión disponible y se está descargando en segundo plano.",
        });
      };

      const onNotAvailable = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({
          status: "up_to_date",
          currentVersion,
          isPortable: false,
          message: "Ya tienes instalada la versión más reciente de Feynman Live.",
        });
      };

      const onError = async () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        const fallback = await checkGitHubReleasesFallback(currentVersion);
        resolve(fallback);
      };

      autoUpdater.once("update-available", onAvailable);
      autoUpdater.once("update-not-available", onNotAvailable);
      autoUpdater.once("update-downloaded", onDownloaded);
      autoUpdater.once("error", onError);

      setTimeout(async () => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          const fallback = await checkGitHubReleasesFallback(currentVersion);
          resolve(fallback);
        }
      }, 8000);

      autoUpdater.checkForUpdates();
    });
  } catch {
    return checkGitHubReleasesFallback(currentVersion);
  }
}

/**
 * Cierra la aplicación e instala la actualización descargada (NSIS o Portable).
 */
export function quitAndInstall(): void {
  if (isPortable()) {
    applyPortableUpdateAndRestart();
    return;
  }

  const electron = getElectron();
  if (!electron) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    loggerInstance?.error("autoupdate", "Error al ejecutar quitAndInstall", err);
  }
}

/**
 * Inicializa las actualizaciones automáticas en segundo plano.
 */
export async function init(
  logger: AppLogger,
  getMainWindow?: () => BrowserWindow | null,
): Promise<void> {
  loggerInstance = logger;
  if (getMainWindow) {
    mainWindowGetter = getMainWindow;
  }

  if (isInitialized) {
    return;
  }

  const electron = getElectron();
  if (!electron?.app?.isPackaged || process.env.NODE_ENV === "test") {
    loggerInstance.info(
      "autoupdate",
      "Auto-update omitido: Ejecutándose en entorno de desarrollo, pruebas o sin empaquetar",
    );
    return;
  }

  if (isPortable()) {
    loggerInstance.info(
      "autoupdate",
      "Modo portable detectado: Verificación periódica activa vía GitHub Releases.",
    );

    const checkPortable = () => {
      checkGitHubReleasesFallback(electron.app.getVersion())
        .then((res) => {
          if (res.status === "update_available") {
            loggerInstance?.info(
              "autoupdate",
              `Nueva versión portable disponible en GitHub: ${res.latestVersion}`,
            );
            emitStatusChanged(res);
          }
        })
        .catch(() => {});
    };

    setTimeout(checkPortable, 5000);
    setInterval(checkPortable, 2 * 60 * 60 * 1000);

    isInitialized = true;
    return;
  }

  try {
    const { autoUpdater } = await import("electron-updater");

    autoUpdater.logger = {
      info: (msg: string) => loggerInstance?.info("autoupdate", msg),
      warn: (msg: string) => loggerInstance?.warn("autoupdate", msg),
      error: (msg: string) => loggerInstance?.error("autoupdate", msg),
      debug: (msg: string) => loggerInstance?.info("autoupdate", msg),
    };

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-downloaded", (info) => {
      updateDownloaded = true;
      downloadedVersion = info.version || null;
      loggerInstance?.info(
        "autoupdate",
        `Actualización descargada y lista para aplicar: ${info.version || "nueva versión"}`,
      );

      emitStatusChanged({
        status: "ready_to_install",
        currentVersion: electron.app.getVersion(),
        latestVersion: info.version,
        isPortable: false,
        message: "Actualización descargada y lista para instalar.",
      });

      if (!electron.dialog) return;

      electron.dialog
        .showMessageBox({
          type: "info",
          buttons: ["Reiniciar y actualizar", "Más tarde"],
          defaultId: 0,
          cancelId: 1,
          title: "Actualización disponible",
          message: "Una nueva versión de Feynman Live ha sido descargada.",
          detail: `La versión ${info.version || ""} está lista para aplicarse.\n¿Deseas reiniciar la aplicación ahora para completar la actualización?`,
        })
        .then((returnValue) => {
          if (returnValue.response === 0) {
            loggerInstance?.info(
              "autoupdate",
              "Usuario aceptó el reinicio. Cerrando e instalando actualización.",
            );
            autoUpdater.quitAndInstall();
          } else {
            loggerInstance?.info(
              "autoupdate",
              "Usuario pospuso el reinicio. La actualización se aplicará al reiniciar.",
            );
          }
        })
        .catch((err) => {
          loggerInstance?.error(
            "autoupdate",
            "Error al mostrar cuadro de diálogo de actualización",
            err,
          );
        });
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      loggerInstance?.warn(
        "autoupdate",
        `Error en checkForUpdates inicial: ${err?.message || err}`,
      );
    });

    setInterval(
      () => {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
          loggerInstance?.warn("autoupdate", `Error en chequeo periódico: ${err?.message || err}`);
        });
      },
      2 * 60 * 60 * 1000,
    );

    isInitialized = true;
    loggerInstance.info("autoupdate", "Servicio electron-updater inicializado correctamente");
  } catch (err) {
    loggerInstance.error("autoupdate", "Error al inicializar el servicio electron-updater", err);
  }
}

export const AutoUpdateService = {
  init,
  isPortable,
  getPortableExecutablePath,
  generatePortableUpdaterScript,
  checkForUpdatesManual,
  checkGitHubReleasesFallback,
  downloadPortableUpdate,
  applyPortableUpdateAndRestart,
  compareSemver,
  quitAndInstall,
  getVersionInfo,
};
