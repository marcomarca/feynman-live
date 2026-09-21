import https from "node:https";
import type { BrowserWindow } from "electron";
import type { UpdateCheckResult } from "../shared/ipc-contract";
import type { AppLogger } from "../shared/logger";

let loggerInstance: AppLogger | null = null;
let isInitialized = false;
let updateDownloaded = false;
let downloadedVersion: string | null = null;
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
 * Comprueba si la aplicación se está ejecutando en modo Portable.
 * Electron Builder establece PORTABLE_EXECUTABLE_DIR al lanzar el ejecutable portable.
 */
export function isPortable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
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
 * Consulta directamente la API de GitHub Releases para verificar versiones en entornos portables
 * o como fallback cuando no hay acceso a latest.yml.
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
            a.name.toLowerCase().includes("portable") &&
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
      return {
        status: "update_available",
        currentVersion,
        latestVersion: latestTag,
        releaseUrl: data.html_url,
        downloadUrl,
        isPortable: portable,
        message: portable
          ? `Nueva versión ${latestTag} disponible. Puedes descargar el nuevo ejecutable portable.`
          : `Nueva versión ${latestTag} disponible para actualizar.`,
      };
    }

    return {
      status: "up_to_date",
      currentVersion,
      latestVersion: latestTag,
      releaseUrl: data.html_url,
      downloadUrl,
      isPortable: portable,
      message: "Ya tienes instalada la versión más reciente de Feynman Live.",
    };
  } catch {
    return {
      status: "up_to_date",
      currentVersion,
      isPortable: portable,
      message: "No se encontraron actualizaciones pendientes o no hay conexión con GitHub.",
    };
  }
}

/**
 * Comprueba manualmente el estado de las actualizaciones.
 * Si se ejecuta desde un archivo portable, consulta directamente GitHub Releases
 * para evitar sobreescritura no autorizada del binario en caliente.
 * En la versión instalada (NSIS), utiliza electron-updater.
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
      isPortable: false,
      message:
        "Actualización descargada y lista para instalar. Reinicia la aplicación para aplicarla.",
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

      // Timeout preventivo tras 8s
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
 * Cierra la aplicación e instala la actualización descargada (NSIS).
 */
export function quitAndInstall(): void {
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
 * - En modo portable: realiza monitoreo periódico contra la API de GitHub sin alterar el binario en caliente.
 * - En modo instalado (NSIS): gestiona descarga automática en segundo plano y aviso de reinicio.
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
      "Modo portable detectado: Verificación periódica activa vía GitHub Releases (sin sobreescritura de binario).",
    );

    const checkPortable = () => {
      checkGitHubReleasesFallback(electron.app.getVersion())
        .then((res) => {
          if (res.status === "update_available") {
            loggerInstance?.info(
              "autoupdate",
              `Nueva versión portable disponible en GitHub: ${res.latestVersion}`,
            );
            const win = mainWindowGetter ? mainWindowGetter() : null;
            if (win && !win.isDestroyed()) {
              win.webContents.send("autoupdate:statusChanged", res);
            }
          }
        })
        .catch(() => {});
    };

    // Chequeo inicial y luego cada 2 horas
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

      const win = mainWindowGetter ? mainWindowGetter() : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send("autoupdate:statusChanged", {
          status: "ready_to_install",
          currentVersion: electron.app.getVersion(),
          latestVersion: info.version,
          isPortable: false,
          message: "Actualización descargada y lista para instalar.",
        });
      }

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

    // Comprobar actualizaciones cada 2 horas
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
  checkForUpdatesManual,
  checkGitHubReleasesFallback,
  compareSemver,
  quitAndInstall,
  getVersionInfo,
};
