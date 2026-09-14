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
});
