import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AudioPlaybackQueue } from "../../src/renderer/audio/playback";

interface MockSourceNode {
  buffer: { duration: number; length: number; getChannelData: () => Float32Array } | null;
  startTime: number | null;
  stopped: boolean;
  connectedTo: unknown | null;
  onended: (() => void) | null;
  connect: (dest: unknown) => void;
  start: (time: number) => void;
  stop: () => void;
  disconnect: () => void;
}

class MockAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  createdSources: MockSourceNode[] = [];

  async resume(): Promise<void> {
    this.state = "running";
  }

  async close(): Promise<void> {
    this.state = "closed";
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const channelData = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (_channel: number) => channelData,
    };
  }

  createBufferSource(): MockSourceNode {
    const node: MockSourceNode = {
      buffer: null,
      startTime: null,
      stopped: false,
      connectedTo: null,
      onended: null,
      start: (time: number) => {
        node.startTime = time;
      },
      stop: () => {
        node.stopped = true;
      },
      connect: (dest: unknown) => {
        node.connectedTo = dest;
      },
      disconnect: () => {
        node.connectedTo = null;
      },
    };
    this.createdSources.push(node);
    return node;
  }
}

describe("AudioPlaybackQueue Continuous Timeline", () => {
  let mockCtx: MockAudioContext;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    mockCtx = new MockAudioContext();
    // biome-ignore lint/suspicious/noExplicitAny: Mocking browser AudioContext
    (globalThis as any).window = {
      // biome-ignore lint/complexity/useArrowFunction: AudioContext is instantiated via new
      AudioContext: function () {
        return mockCtx;
      },
    };
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Restoring original environment
    (globalThis as any).window = originalWindow;
  });

  it("schedules consecutive chunks gaplessly on a continuous timeline", () => {
    const queue = new AudioPlaybackQueue({ sampleRate: 24000 });

    // 24000 samples/sec -> 2400 samples = 0.1s (100ms) = 4800 bytes in PCM16
    const chunk1 = new Uint8Array(4800);
    const chunk2 = new Uint8Array(4800);
    const chunk3 = new Uint8Array(4800);

    // t = 0.0s: First chunk arrives
    mockCtx.currentTime = 0.0;
    queue.enqueuePcm16(chunk1);

    expect(mockCtx.createdSources.length).toBe(1);
    expect(mockCtx.createdSources[0].startTime).toBe(0.0);

    // t = 0.08s (80ms later): Second chunk arrives while first is still playing
    mockCtx.currentTime = 0.08;
    queue.enqueuePcm16(chunk2);

    expect(mockCtx.createdSources.length).toBe(2);
    // Crucial: Must be scheduled at exactly 0.1s (no gap, no artificial lead time added)
    expect(mockCtx.createdSources[1].startTime).toBeCloseTo(0.1, 4);

    // t = 0.18s: Third chunk arrives
    mockCtx.currentTime = 0.18;
    queue.enqueuePcm16(chunk3);

    expect(mockCtx.createdSources.length).toBe(3);
    // Must be scheduled at exactly 0.2s
    expect(mockCtx.createdSources[2].startTime).toBeCloseTo(0.2, 4);

    expect(queue.isPlaying).toBe(true);
  });

  it("handles underruns without introducing dead air gaps", () => {
    const queue = new AudioPlaybackQueue({ sampleRate: 24000 });

    // 4800 bytes = 0.1s (100ms)
    const chunk1 = new Uint8Array(4800);
    const chunk2 = new Uint8Array(4800);

    // t = 0: Chunk 1 arrives, duration = 0.1s, ends at 0.1s
    mockCtx.currentTime = 0.0;
    queue.enqueuePcm16(chunk1);
    expect(mockCtx.createdSources[0].startTime).toBe(0.0);

    // Simulate chunk 1 ending at 0.1s
    mockCtx.createdSources[0].onended?.();

    // t = 0.3s: Network jitter delayed chunk 2 by 200ms past chunk 1's end
    mockCtx.currentTime = 0.3;
    queue.enqueuePcm16(chunk2);

    expect(mockCtx.createdSources.length).toBe(2);
    // Must start immediately at currentTime (0.3s), NOT 0.3s + 150ms lead time!
    expect(mockCtx.createdSources[1].startTime).toBe(0.3);
  });

  it("clear() stops all active sources and resets nextStartTime", () => {
    const queue = new AudioPlaybackQueue({ sampleRate: 24000 });

    queue.enqueuePcm16(new Uint8Array(4800));
    queue.enqueuePcm16(new Uint8Array(4800));

    expect(queue.isPlaying).toBe(true);
    expect(mockCtx.createdSources.length).toBe(2);

    queue.clear();

    expect(queue.isPlaying).toBe(false);
    expect(mockCtx.createdSources[0].stopped).toBe(true);
    expect(mockCtx.createdSources[1].stopped).toBe(true);
  });

  it("reassembles odd byte boundaries across consecutive chunks", () => {
    const queue = new AudioPlaybackQueue({ sampleRate: 24000 });

    // 5 bytes (2 samples + 1 remainder byte)
    const chunk1 = new Uint8Array([0x00, 0x10, 0x00, 0x20, 0x7f]);
    // 3 bytes (1 remainder byte + 3 bytes = 4 bytes = 2 samples)
    const chunk2 = new Uint8Array([0x30, 0x00, 0x40]);

    queue.enqueuePcm16(chunk1);
    expect(mockCtx.createdSources.length).toBe(1);
    // 4 bytes processed -> 2 samples
    expect(mockCtx.createdSources[0].buffer?.length).toBe(2);

    queue.enqueuePcm16(chunk2);
    expect(mockCtx.createdSources.length).toBe(2);
    // 1 remainder byte + 3 bytes = 4 bytes -> 2 samples
    expect(mockCtx.createdSources[1].buffer?.length).toBe(2);
  });
});
