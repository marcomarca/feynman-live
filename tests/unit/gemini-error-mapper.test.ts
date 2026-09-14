import { describe, expect, it } from "bun:test";
import { GeminiErrorMapper } from "../../src/adapters/gemini/GeminiErrorMapper";

describe("GeminiErrorMapper", () => {
  it("should map 401 and invalid key errors to AUTH_INVALID", () => {
    const err = GeminiErrorMapper.map(
      new Error("API_KEY_INVALID: The provided API key is expired."),
    );
    expect(err.code).toBe("AUTH_INVALID");
    expect(err.retryable).toBe(false);
  });

  it("should map RESOURCE_EXHAUSTED / quota errors to QUOTA_EXHAUSTED", () => {
    const err = GeminiErrorMapper.map(new Error("Resource has been exhausted (e.g. check quota)."));
    expect(err.code).toBe("QUOTA_EXHAUSTED");
    expect(err.retryable).toBe(false);
  });

  it("should map 429 rate limit errors to RATE_LIMITED with retryable=true", () => {
    const err = GeminiErrorMapper.map(new Error("Rate limit exceeded 429: Too many requests."));
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryable).toBe(true);
  });

  it("should map 404 / model not found to MODEL_UNAVAILABLE", () => {
    const err = GeminiErrorMapper.map(
      new Error("Model gemini-3.1-flash-live-preview is not supported or not found."),
    );
    expect(err.code).toBe("MODEL_UNAVAILABLE");
    expect(err.retryable).toBe(false);
  });

  it("should map network offline errors to NETWORK_OFFLINE with retryable=true", () => {
    const err = GeminiErrorMapper.map(
      new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com"),
    );
    expect(err.code).toBe("NETWORK_OFFLINE");
    expect(err.retryable).toBe(true);
  });

  it("should map websocket closure to CONNECTION_CLOSED", () => {
    const err = GeminiErrorMapper.map(new Error("WebSocket connection closed with code 1006."));
    expect(err.code).toBe("CONNECTION_CLOSED");
    expect(err.retryable).toBe(true);
  });

  it("should fallback unknown errors safely", () => {
    const err = GeminiErrorMapper.map(null);
    expect(err.code).toBe("UNKNOWN");
  });
});
