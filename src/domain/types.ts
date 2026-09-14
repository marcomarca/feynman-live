export * from "./result";
export * from "./app-error";
export * from "./session-state";
export * from "./app-settings";
export * from "./portable-prompt";

export interface AudioChunk {
  readonly data: Uint8Array;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface LiveTextMessage {
  readonly id: string;
  readonly text: string;
  readonly sentAt: number;
}
