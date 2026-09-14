import { existsSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, app, shell } from "electron";

export interface WindowManager {
  createMainWindow(): BrowserWindow;
  getMainWindow(): BrowserWindow | null;
  showAndFocus(): void;
  setQuitting(quitting: boolean): void;
}

export class ElectronWindowManager implements WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  setQuitting(quitting: boolean): void {
    this.isQuitting = quitting;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  showAndFocus(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.createMainWindow();
      return;
    }

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private resolvePreloadPath(): string {
    const candidates = [
      join(app.getAppPath(), "dist-electron", "preload.js"),
      join(process.cwd(), "dist-electron", "preload.js"),
      join(__dirname, "preload.js"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private resolveIndexPath(): string | null {
    const candidates = [
      join(app.getAppPath(), "dist", "index.html"),
      join(process.cwd(), "dist", "index.html"),
      join(__dirname, "..", "dist", "index.html"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.showAndFocus();
      return this.mainWindow;
    }

    const preloadPath = this.resolvePreloadPath();

    this.mainWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 850,
      minHeight: 650,
      title: "Feynman Live",
      backgroundColor: "#0d1117",
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
    });

    // Hide to tray on close unless app is quitting
    this.mainWindow.on("close", (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    // Block unexpected in-app navigation
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    this.mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
      const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
      if (isDev && navigationUrl.startsWith("http://localhost:5190")) {
        return;
      }
      if (!navigationUrl.startsWith("file://")) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    });

    // Load URL or build artifact
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      this.mainWindow.loadURL(devServerUrl);
    } else {
      const indexPath = this.resolveIndexPath();
      if (indexPath) {
        this.mainWindow.loadFile(indexPath);
      } else {
        // Fallback dedicated port (5190)
        this.mainWindow.loadURL("http://localhost:5190");
      }
    }

    return this.mainWindow;
  }
}
