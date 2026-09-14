import { type AppError, createAppError } from "../../domain/app-error";
import type { FallbackProviderId } from "../../domain/app-settings";
import { type Result, err, ok } from "../../domain/result";
import { ALLOWED_EXTERNAL_PROVIDERS } from "../../shared/constants";

export interface ShellProvider {
  openExternal: (url: string) => Promise<void>;
}

export interface ExternalProviderLauncherPort {
  openProvider(providerId: FallbackProviderId): Promise<Result<void, AppError>>;
  getProviderUrl(providerId: FallbackProviderId): string | undefined;
}

export class ExternalProviderLauncher implements ExternalProviderLauncherPort {
  constructor(private readonly shell?: ShellProvider) {}

  getProviderUrl(providerId: FallbackProviderId): string | undefined {
    return ALLOWED_EXTERNAL_PROVIDERS[providerId];
  }

  async openProvider(providerId: FallbackProviderId): Promise<Result<void, AppError>> {
    const url = this.getProviderUrl(providerId);
    if (!url) {
      return err(
        createAppError(
          "PROVIDER_ERROR",
          `Proveedor no soportado o no permitido: ${providerId}`,
          undefined,
          false,
        ),
      );
    }

    try {
      if (this.shell && typeof this.shell.openExternal === "function") {
        await this.shell.openExternal(url);
      }
      return ok(undefined);
    } catch (e) {
      return err(
        createAppError(
          "NETWORK_OFFLINE",
          `No se pudo abrir el navegador para ${providerId}`,
          e instanceof Error ? e.message : String(e),
          true,
        ),
      );
    }
  }
}
