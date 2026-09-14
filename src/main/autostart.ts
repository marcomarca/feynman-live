import { app } from "electron";

export function setLaunchAtLogin(enabled: boolean): boolean {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function isLaunchAtLoginEnabled(): boolean {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch {
    return false;
  }
}

export const AutostartManager = {
  setLaunchAtLogin,
  isLaunchAtLoginEnabled,
};
