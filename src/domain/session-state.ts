import type { AppError } from "./app-error";

export type SessionState =
  | { readonly status: "idle" }
  | { readonly status: "connecting" }
  | { readonly status: "listening"; readonly startedAt: number }
  | { readonly status: "speaking"; readonly startedAt: number }
  | { readonly status: "reconnecting"; readonly attempt: number; readonly maxAttempts: number }
  | { readonly status: "stopping" }
  | { readonly status: "error"; readonly error: AppError };

export const INITIAL_SESSION_STATE: SessionState = { status: "idle" };
