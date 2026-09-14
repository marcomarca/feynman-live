import type { FeynmanDesktopApi } from "../shared/ipc-contract";

declare global {
  interface Window {
    readonly feynmanDesktopApi?: FeynmanDesktopApi;
  }
}
