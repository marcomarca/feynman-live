/**
 * Convert Float32Array [-1.0, 1.0] samples to 16-bit signed PCM little-endian byte buffer.
 */
export function float32ToPcm16(float32Array: Float32Array): Uint8Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
}

/**
 * Convert 16-bit signed PCM little-endian byte buffer to Float32Array [-1.0, 1.0].
 */
export function pcm16ToFloat32(pcm16Bytes: Uint8Array): Float32Array {
  const int16Array = new Int16Array(
    pcm16Bytes.buffer,
    pcm16Bytes.byteOffset,
    pcm16Bytes.byteLength / 2,
  );
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32Array;
}

/**
 * Linear interpolation resampling for mono audio buffer.
 */
export function resample(
  buffer: Float32Array,
  fromSampleRate: number,
  toSampleRate: number,
): Float32Array {
  if (fromSampleRate === toSampleRate || buffer.length === 0) {
    return buffer;
  }

  const ratio = fromSampleRate / toSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const sourceIndex = i * ratio;
    const indexLow = Math.floor(sourceIndex);
    const indexHigh = Math.min(indexLow + 1, buffer.length - 1);
    const fraction = sourceIndex - indexLow;

    result[i] = buffer[indexLow] * (1 - fraction) + buffer[indexHigh] * fraction;
  }

  return result;
}
