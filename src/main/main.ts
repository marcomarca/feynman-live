import { join } from "node:path";
import { app, clipboard, safeStorage, shell } from "electron";
import { ElectronClipboardAdapter } from "../adapters/desktop/ClipboardAdapter";
import { ExternalProviderLauncher } from "../adapters/desktop/ExternalProviderLauncher";
import { GeminiLiveAdapter } from "../adapters/gemini/GeminiLiveAdapter";
import { AppDataStore } from "../adapters/persistence/AppDataStore";
import { SafeStorageSecretStore } from "../adapters/persistence/SafeStorageSecretStore";
import { defaultCompiler } from "../services/PortablePromptCompiler";
import { PortablePromptService } from "../services/PortablePromptService";
import { SettingsService } from "../services/SettingsService";
import { StudySessionService } from "../services/StudySessionService";
import { AppLogger } from "../shared/logger";
import { AutostartManager } from "./autostart";
import { registerIpcHandlers } from "./ipc-handlers";
import { ShortcutManager } from "./shortcuts";
import { TrayManager } from "./tray";
import { ElectronWindowManager } from "./window";

// Request Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const windowManager = new ElectronWindowManager();
  const shortcutManager = new ShortcutManager(windowManager);

  app.on("second-instance", () => {
    windowManager.showAndFocus();
  });

  app.whenReady().then(async () => {
    const userDataPath = app.getPath("userData");

    // Initialize logger
    const logger = new AppLogger(userDataPath);
    logger.info("Main", "Inicializando servicios de Feynman Live...");

    // Initialize stores & adapters with injected Electron native providers
    const dataStore = new AppDataStore(userDataPath);
    const secretStore = new SafeStorageSecretStore(
      userDataPath,
      safeStorage,
      join(process.cwd(), ".env"),
    );
    const clipboardAdapter = new ElectronClipboardAdapter(clipboard);
    const providerLauncher = new ExternalProviderLauncher(shell);
    const liveAdapter = new GeminiLiveAdapter(logger);

    // Initialize services
    const promptService = new PortablePromptService(dataStore, defaultCompiler, clipboardAdapter);
    const settingsService = new SettingsService(dataStore, secretStore);
    const sessionService = new StudySessionService(dataStore, secretStore, liveAdapter);

    // Load initial settings
    const settings = await settingsService.getSettings();

    // Setup shortcuts and autostart
    shortcutManager.register(settings.globalShortcut || "CommandOrControl+Shift+Space");
    if (settings.launchAtLogin) {
      AutostartManager.setLaunchAtLogin(true);
    }

    // Register IPC
    registerIpcHandlers({
      dataStore,
      settingsService,
      promptService,
      providerLauncher,
      clipboardAdapter,
      sessionService,
      getMainWindow: () => windowManager.getMainWindow(),
    });

    // Create Main Window
    windowManager.createMainWindow();

    // Setup Tray
    const trayManager = new TrayManager(windowManager, () => {
      const win = windowManager.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("settings:openModal");
      }
    });
    trayManager.setupTray();

    app.on("activate", () => {
      windowManager.showAndFocus();
    });

    app.on("before-quit", () => {
      windowManager.setQuitting(true);
      shortcutManager.unregisterAll();
      trayManager.destroy();
      sessionService.stop().catch(() => {});
    });
  });

  app.on("window-all-closed", () => {
    // Keep running in tray on Windows unless explicitly quit
    if (process.platform !== "darwin") {
      // do not quit, remain in tray
    }
  });
}
