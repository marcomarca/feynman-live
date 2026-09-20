import { existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import type { UpdateCheckResult } from "../shared/ipc-contract";
import type { AppLogger } from "../shared/logger";

let loggerInstance: AppLogger | null = null;
let isInitialized = false;

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
 * Comprueba si la aplicación se ejecuta desde una instalación de Squirrel.Windows.
 */
export function isSquirrelInstalled(): boolean {
  if (process.platform !== "win32") return false;
  try {
    const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
    return existsSync(updateExe);
  } catch {
    return false;
  }
}

/**
 * Consulta directamente la API de GitHub Releases para verificar versiones en entornos portables.
 */
export async function checkGitHubReleasesFallback(
  currentVersion: string,
): Promise<UpdateCheckResult> {
  try {
    const url = "https://api.github.com/repos/marcomarca/feynman-live/releases/latest";

    const data = await new Promise<{ tag_name?: string; html_url?: string }>((resolve, reject) => {
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

    if (isNewer) {
      return {
        status: "update_available",
        currentVersion,
        latestVersion: latestTag,
        releaseUrl: data.html_url,
        message: `Nueva versión ${latestTag} disponible en GitHub.`,
      };
    }

    return {
      status: "up_to_date",
      currentVersion,
      latestVersion: latestTag,
      releaseUrl: data.html_url,
      message: "Ya tienes instalada la versión más reciente de Feynman Live.",
    };
  } catch {
    return {
      status: "up_to_date",
      currentVersion,
      message: "No se encontraron actualizaciones pendientes o no hay conexión con GitHub.",
    };
  }
}

/**
 * Comprueba manualmente el estado de las actualizaciones.
 * Si no está en un entorno Squirrel (ej: portable o desarrollo),
 * consulta directamente la API de GitHub Releases sin disparar errores de Squirrel.
 */
export async function checkForUpdatesManual(): Promise<UpdateCheckResult> {
  const electron = getElectron();
  const currentVersion = electron?.app ? electron.app.getVersion() : "0.0.0";

  if (!isSquirrelInstalled() || !electron?.autoUpdater) {
    return checkGitHubReleasesFallback(currentVersion);
  }

  try {
    const { autoUpdater } = electron;

    return new Promise<UpdateCheckResult>((resolve) => {
      let isResolved = false;

      const cleanup = () => {
        autoUpdater.removeListener("update-available", onAvailable);
        autoUpdater.removeListener("update-not-available", onNotAvailable);
        autoUpdater.removeListener("error", onError);
      };

      const onAvailable = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({
          status: "downloading",
          currentVersion,
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
 * Inicializa las actualizaciones automáticas en segundo plano.
 * - Solo activo en producción (app.isPackaged) y fuera de entorno de pruebas.
 * - Consulta periódicamente GitHub Releases (cada 2 horas) usando update-electron-app.
 * - En versión instalada (Squirrel), descarga en segundo plano y muestra diálogo de reinicio.
 */
export async function init(logger: AppLogger): Promise<void> {
  loggerInstance = logger;

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

  try {
    const { updateElectronApp, UpdateSourceType } = await import("update-electron-app");

    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: "marcomarca/feynman-live",
      },
      updateInterval: "2 hours",
      logger: {
        log: (msg: string) => loggerInstance?.info("autoupdate", msg),
        info: (msg: string) => loggerInstance?.info("autoupdate", msg),
        warn: (msg: string) => loggerInstance?.warn("autoupdate", msg),
        error: (msg: string) => loggerInstance?.error("autoupdate", msg),
      },
      notifyUser: true,
      onNotifyUser: (info) => {
        loggerInstance?.info(
          "autoupdate",
          `Actualización lista para aplicar: ${info.releaseName || "nueva versión"}`,
        );

        electron.dialog
          .showMessageBox({
            type: "info",
            buttons: ["Reiniciar y actualizar", "Más tarde"],
            defaultId: 0,
            cancelId: 1,
            title: "Actualización disponible",
            message: "Una nueva versión de Feynman Live ha sido descargada.",
            detail: `La versión ${info.releaseName || ""} está lista para aplicarse.\n¿Deseas reiniciar la aplicación ahora para completar la actualización?`,
          })
          .then((returnValue) => {
            if (returnValue.response === 0) {
              loggerInstance?.info(
                "autoupdate",
                "Usuario aceptó el reinicio. Cerrando e instalando actualización.",
              );
              electron.autoUpdater.quitAndInstall();
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
      },
    });

    isInitialized = true;
    loggerInstance.info(
      "autoupdate",
      "Servicio de actualización automática inicializado correctamente",
    );
  } catch (err) {
    loggerInstance.error(
      "autoupdate",
      "Error al inicializar el servicio de actualización automática",
      err,
    );
  }
}

export const AutoUpdateService = {
  init,
  isSquirrelInstalled,
  checkForUpdatesManual,
  checkGitHubReleasesFallback,
  compareSemver,
};
