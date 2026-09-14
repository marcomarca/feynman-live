import { describe, expect, it } from "bun:test";
import { float32ToPcm16, pcm16ToFloat32, resample } from "../../src/renderer/audio/pcm";

describe("PCM and Audio Utilities", () => {
  it("should convert Float32 to PCM16 and back with minimal loss", () => {
    const original = new Float32Array([0.0, 0.5, -0.5, 0.99, -0.99]);
    const pcm16Bytes = float32ToPcm16(original);

    expect(pcm16Bytes.byteLength).toBe(original.length * 2);

    const convertedBack = pcm16ToFloat32(pcm16Bytes);
    expect(convertedBack.length).toBe(original.length);

    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(convertedBack[i] - original[i])).toBeLessThan(0.001);
    }
  });

  it("should clamp out-of-range floats", () => {
    const floats = new Float32Array([1.5, -2.0]);
    const pcm16 = float32ToPcm16(floats);
    const roundtrip = pcm16ToFloat32(pcm16);

    expect(roundtrip[0]).toBeCloseTo(1.0, 2);
    expect(roundtrip[1]).toBeCloseTo(-1.0, 2);
  });

  it("should resample audio buffers correctly", () => {
    const input = new Float32Array([0, 0.2, 0.4, 0.6, 0.8, 1.0]);
    const resampled = resample(input, 48000, 16000); // 3:1 downsample

    expect(resampled.length).toBe(2);
  });

  it("should handle odd byte lengths and unaligned byte offsets without throwing", () => {
    // Create a buffer with an unaligned offset (byteOffset = 1)
    const raw = new Uint8Array([0xff, 0x00, 0x40, 0x00, 0x80, 0x7f, 0x00]); // 7 bytes
    const unalignedSubarray = raw.subarray(1, 6); // 5 bytes, byteOffset = 1

    const float32 = pcm16ToFloat32(unalignedSubarray);
    // 5 bytes -> floor(5/2) = 2 samples
    expect(float32.length).toBe(2);
    expect(typeof float32[0]).toBe("number");
    expect(typeof float32[1]).toBe("number");
  });
});
