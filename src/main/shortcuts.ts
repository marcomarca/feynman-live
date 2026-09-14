import { globalShortcut } from "electron";
import type { WindowManager } from "./window";

export class ShortcutManager {
  private currentShortcut: string | null = null;

  constructor(private readonly windowManager: WindowManager) {}

  register(accelerator: string): boolean {
    this.unregister();

    try {
      const success = globalShortcut.register(accelerator, () => {
        this.windowManager.showAndFocus();
      });

      if (success) {
        this.currentShortcut = accelerator;
      }
      return success;
    } catch {
      return false;
    }
  }

  unregister(): void {
    if (this.currentShortcut) {
      try {
        globalShortcut.unregister(this.currentShortcut);
      } catch {
        // ignore unregister error
      }
      this.currentShortcut = null;
    }
  }

  unregisterAll(): void {
    try {
      globalShortcut.unregisterAll();
    } catch {
      // ignore
    }
    this.currentShortcut = null;
  }
}
