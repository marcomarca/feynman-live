/**
 * Utility functions to encode raw PCM 16-bit Mono audio bytes into standard RIFF WAV format.
 */
export function encodePcm16ToWav(pcmBytes: Uint8Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBytes.byteLength;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = Buffer.alloc(totalSize);

  // RIFF Chunk Descriptor
  buffer.write("RIFF", 0); // ChunkID
  buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  buffer.write("WAVE", 8); // Format

  // fmt sub-chunk
  buffer.write("fmt ", 12); // Subchunk1ID
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(byteRate, 28); // ByteRate
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // data sub-chunk
  buffer.write("data", 36); // Subchunk2ID
  buffer.writeUInt32LE(dataSize, 40); // Subchunk2Size

  // Copy PCM samples
  Buffer.from(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength).copy(buffer, 44);

  return buffer;
}

export function calculateWavDurationMs(pcmByteLength: number, sampleRate: number): number {
  const bytesPerSample = 2; // 16-bit mono
  const samples = pcmByteLength / bytesPerSample;
  return Math.round((samples / sampleRate) * 1000);
}

export const WavEncoder = {
  encodePcm16: encodePcm16ToWav,
  calculateDurationMs: calculateWavDurationMs,
};
