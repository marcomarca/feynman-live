import { type AppError, createAppError } from "../../domain/app-error";

export function mapGeminiError(error: unknown): AppError {
  if (!error) {
    return createAppError("UNKNOWN", "Ha ocurrido un error desconocido", undefined, false);
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // 1. Auth errors
  if (
    lower.includes("leaked") ||
    lower.includes("reported as leaked") ||
    lower.includes("api_key_invalid") ||
    lower.includes("invalid api key") ||
    lower.includes("api key not valid") ||
    lower.includes("api key is not valid") ||
    lower.includes("api key is invalid") ||
    lower.includes("unauthenticated") ||
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    lower.includes("bad api key") ||
    lower.includes("api key expired") ||
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    const isLeaked = lower.includes("leaked");
    return createAppError(
      "AUTH_INVALID",
      isLeaked
        ? "Tu API Key fue reportada como filtrada (leaked) y Google la ha revocado. Genera una nueva API Key en Google AI Studio y cámbiala en Configuración."
        : "API key de Gemini no válida o sin permisos suficientes.",
      message,
      false,
    );
  }

  // 2. Quota / Billing errors
  if (
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted") ||
    lower.includes("quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("billing") ||
    lower.includes("free tier limit")
  ) {
    return createAppError(
      "QUOTA_EXHAUSTED",
      "Cuota de Gemini Live agotada para esta API key.",
      "Puedes continuar tu sesión inmediatamente usando el modo portable en ChatGPT o Google AI Studio.",
      false,
    );
  }

  // 3. Rate limiting (transient)
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("429")
  ) {
    return createAppError(
      "RATE_LIMITED",
      "Límite de peticiones por minuto alcanzado.",
      message,
      true,
    );
  }

  // 4. Model availability / Unsupported / Location / Bad parameters
  if (
    lower.includes("model not found") ||
    lower.includes("not found") ||
    lower.includes("404") ||
    lower.includes("is not supported") ||
    lower.includes("not supported in your country") ||
    lower.includes("location is not supported") ||
    lower.includes("model_unavailable") ||
    lower.includes("unknown model") ||
    lower.includes("invalid_argument") ||
    lower.includes("1007")
  ) {
    return createAppError(
      "MODEL_UNAVAILABLE",
      "El modelo o configuración de Gemini Live no es compatible o no está disponible.",
      message,
      false,
    );
  }

  // 5. Network / Offline
  if (
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("offline")
  ) {
    return createAppError(
      "NETWORK_OFFLINE",
      "No se pudo conectar con los servidores de Google (sin conexión).",
      message,
      true,
    );
  }

  // 6. WebSocket / Connection closed
  if (
    lower.includes("connection closed") ||
    lower.includes("1006") ||
    lower.includes("websocket closed") ||
    lower.includes("econnreset")
  ) {
    return createAppError(
      "CONNECTION_CLOSED",
      "La conexión en tiempo real se cerró inesperadamente.",
      message,
      true,
    );
  }

  // 7. Session expired / GoAway
  if (
    lower.includes("goaway") ||
    lower.includes("session expired") ||
    lower.includes("max duration")
  ) {
    return createAppError(
      "SESSION_EXPIRED",
      "La sesión en tiempo real ha expirado.",
      message,
      true,
    );
  }

  // 8. General provider error
  return createAppError("PROVIDER_ERROR", `Error de Gemini Live: ${message}`, message, false);
}

export const GeminiErrorMapper = {
  map: mapGeminiError,
};
