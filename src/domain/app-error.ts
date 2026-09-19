export type AppErrorCode =
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "NETWORK_OFFLINE"
  | "CONNECTION_CLOSED"
  | "SESSION_EXPIRED"
  | "MIC_PERMISSION_DENIED"
  | "AUDIO_DEVICE_ERROR"
  | "PROVIDER_ERROR"
  | "TURN_ACK_TIMEOUT"
  | "MODEL_START_TIMEOUT"
  | "MODEL_STALLED_TIMEOUT"
  | "UNKNOWN";

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly details?: string;
  readonly retryable: boolean;
}

export function createAppError(
  code: AppErrorCode,
  message: string,
  details?: string,
  retryable = false,
): AppError {
  return {
    code,
    message,
    details,
    retryable,
  };
}
