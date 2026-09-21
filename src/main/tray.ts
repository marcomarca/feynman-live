import { existsSync } from "node:fs";
import { join } from "node:path";
import { Menu, Tray, app, nativeImage } from "electron";
import type { WindowManager } from "./window";

export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private readonly windowManager: WindowManager,
    private readonly onOpenSettings: () => void,
  ) {}

  private resolveTrayIcon(): Electron.NativeImage {
    const candidates = [
      join(app.getAppPath(), "resources", "icons", "tray-16.png"),
      join(process.cwd(), "resources", "icons", "tray-16.png"),
      join(__dirname, "..", "resources", "icons", "tray-16.png"),
      join(app.getAppPath(), "resources", "icons", "app.ico"),
      join(process.cwd(), "resources", "icons", "app.ico"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return nativeImage.createFromPath(candidate);
      }
    }

    // Fallback minimal 16x16 icon in memory if file is not found
    return nativeImage.createFromBuffer(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAFNJREFUOE9jZKAQMFKon2HUAIbRMAA5g5EB443/j1mZkBVgMxCLAUwMDIwMzFCaGQn5E1kBNkMwDaC5ABuGM4wYGA4MYBl+jDCAuQBb1DFAAgAAf9A84Vv+4uAAAAAASUVORK5CYII=",
        "base64",
      ),
    );
  }

  setupTray(): void {
    if (this.tray) return;

    const icon = this.resolveTrayIcon();

    this.tray = new Tray(icon);
    this.tray.setToolTip("Feynman Live — Aprendizaje conversacional");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Abrir Feynman Live",
        click: () => {
          this.windowManager.showAndFocus();
        },
      },
      {
        label: "Configuración",
        click: () => {
          this.windowManager.showAndFocus();
          this.onOpenSettings();
        },
      },
      { type: "separator" },
      {
        label: "Salir",
        click: () => {
          this.windowManager.setQuitting(true);
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.on("click", () => {
      this.windowManager.showAndFocus();
    });
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
