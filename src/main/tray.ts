import { Menu, Tray, app, nativeImage } from "electron";
import type { WindowManager } from "./window";

export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private readonly windowManager: WindowManager,
    private readonly onOpenSettings: () => void,
  ) {}

  setupTray(): void {
    if (this.tray) return;

    // Create minimal 16x16 icon in memory if file is not found
    const icon = nativeImage.createFromBuffer(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAFNJREFUOE9jZKAQMFKon2HUAIbRMAA5g5EB443/j1mZkBVgMxCLAUwMDIwMzFCaGQn5E1kBNkMwDaC5ABuGM4wYGA4MYBl+jDCAuQBb1DFAAgAAf9A84Vv+4uAAAAAASUVORK5CYII=",
        "base64",
      ),
    );

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
