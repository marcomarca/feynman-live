import { describe, expect, it } from "bun:test";
import { WavEncoder } from "../../src/adapters/persistence/WavEncoder";

describe("WavEncoder", () => {
  it("should encode PCM16 bytes into valid RIFF WAV structure", () => {
    // 16000 Hz, 1 channel, 1000 samples = 2000 bytes = 1/16 second (62.5ms)
    const pcmData = new Uint8Array(2000);
    for (let i = 0; i < pcmData.length; i++) {
      pcmData[i] = (i * 3) % 256;
    }

    const wavBuffer = WavEncoder.encodePcm16(pcmData, 16000);

    // Total size should be 44 header bytes + 2000 data bytes = 2044 bytes
    expect(wavBuffer.length).toBe(2044);

    // Header validation
    expect(wavBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wavBuffer.readUInt32LE(4)).toBe(2000 + 36);
    expect(wavBuffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wavBuffer.subarray(12, 16).toString("ascii")).toBe("fmt ");
    expect(wavBuffer.readUInt32LE(16)).toBe(16); // Subchunk1Size
    expect(wavBuffer.readUInt16LE(20)).toBe(1); // AudioFormat: PCM
    expect(wavBuffer.readUInt16LE(22)).toBe(1); // NumChannels: 1
    expect(wavBuffer.readUInt32LE(24)).toBe(16000); // SampleRate
    expect(wavBuffer.readUInt32LE(28)).toBe(32000); // ByteRate = 16000 * 1 * 2
    expect(wavBuffer.readUInt16LE(32)).toBe(2); // BlockAlign
    expect(wavBuffer.readUInt16LE(34)).toBe(16); // BitsPerSample
    expect(wavBuffer.subarray(36, 40).toString("ascii")).toBe("data");
    expect(wavBuffer.readUInt32LE(40)).toBe(2000); // Subchunk2Size

    // Data payload matches
    expect(wavBuffer.subarray(44).equals(Buffer.from(pcmData))).toBe(true);
  });

  it("should accurately calculate duration in ms", () => {
    // 24000 Hz, 16-bit mono -> 48000 bytes per second
    const oneSecBytes = 48000;
    const duration = WavEncoder.calculateDurationMs(oneSecBytes, 24000);
    expect(duration).toBe(1000);

    const halfSecBytes = 24000;
    expect(WavEncoder.calculateDurationMs(halfSecBytes, 24000)).toBe(500);
  });
});
