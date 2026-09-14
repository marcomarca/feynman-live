import type { AppError } from "../../domain/app-error";

export interface SessionRecoveryPolicy {
  shouldRetry(error: AppError, currentAttempt: number): boolean;
  getBackoffDelay(currentAttempt: number): number;
  maxAttempts: number;
}

export class DefaultSessionRecoveryPolicy implements SessionRecoveryPolicy {
  readonly maxAttempts = 3;

  shouldRetry(error: AppError, currentAttempt: number): boolean {
    if (!error.retryable) {
      return false;
    }

    if (currentAttempt >= this.maxAttempts) {
      return false;
    }

    // Never retry on non-recoverable error codes
    switch (error.code) {
      case "AUTH_MISSING":
      case "AUTH_INVALID":
      case "QUOTA_EXHAUSTED":
      case "MODEL_UNAVAILABLE":
      case "MIC_PERMISSION_DENIED":
      case "AUDIO_DEVICE_ERROR":
        return false;
      default:
        return true;
    }
  }

  getBackoffDelay(currentAttempt: number): number {
    // Exponential backoff: 500ms, 1500ms, 3000ms
    return Math.min(500 * 2 ** (currentAttempt - 1), 3000);
  }
}
