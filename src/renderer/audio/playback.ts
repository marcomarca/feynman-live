import { pcm16ToFloat32 } from "./pcm";

export interface PlaybackOptions {
  sampleRate?: number;
  leadTimeSeconds?: number;
  onVolumeChange?: (volume: number) => void;
  onPlaybackEnded?: () => void;
}

export class AudioPlaybackQueue {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private sampleRate = 24000;
  private leadTimeSeconds = 0.06;
  private remainder: Uint8Array | null = null;
  private onVolumeChange?: (volume: number) => void;
  private onPlaybackEnded?: () => void;

  constructor(options?: PlaybackOptions) {
    this.sampleRate = options?.sampleRate || 24000;
    this.leadTimeSeconds = options?.leadTimeSeconds ?? 0.06;
    this.onVolumeChange = options?.onVolumeChange;
    this.onPlaybackEnded = options?.onPlaybackEnded;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
      this.nextStartTime = 0;
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  get isPlaying(): boolean {
    return this.activeSources.size > 0;
  }

  enqueuePcm16(pcm16Bytes: Uint8Array): void {
    if (!pcm16Bytes || pcm16Bytes.length === 0) return;

    // Handle odd byte boundaries across chunks
    let bytesToProcess: Uint8Array;
    if (this.remainder && this.remainder.length > 0) {
      const merged = new Uint8Array(this.remainder.length + pcm16Bytes.length);
      merged.set(this.remainder, 0);
      merged.set(pcm16Bytes, this.remainder.length);
      bytesToProcess = merged;
      this.remainder = null;
    } else {
      bytesToProcess = pcm16Bytes;
    }

    if (bytesToProcess.length % 2 !== 0) {
      const evenLen = bytesToProcess.length - 1;
      this.remainder = bytesToProcess.slice(evenLen);
      bytesToProcess = bytesToProcess.subarray(0, evenLen);
    }

    if (bytesToProcess.length === 0) return;

    const ctx = this.ensureContext();
    const float32Samples = pcm16ToFloat32(bytesToProcess);
    if (float32Samples.length === 0) return;

    // Calculate RMS volume for visual indicator
    if (this.onVolumeChange) {
      let sum = 0;
      for (let i = 0; i < float32Samples.length; i++) {
        sum += float32Samples[i] * float32Samples[i];
      }
      const rms = Math.sqrt(sum / float32Samples.length);
      this.onVolumeChange(Math.min(1, rms * 4));
    }

    const audioBuffer = ctx.createBuffer(1, float32Samples.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(float32Samples);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    // Jitter buffer lead-time scheduling: prevents underruns between streaming network chunks
    let startTime: number;
    if (this.nextStartTime < currentTime + 0.01) {
      startTime = currentTime + this.leadTimeSeconds;
    } else {
      startTime = this.nextStartTime;
    }

    sourceNode.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    this.activeSources.add(sourceNode);

    sourceNode.onended = () => {
      this.activeSources.delete(sourceNode);
      sourceNode.disconnect();
      if (this.activeSources.size === 0) {
        this.onVolumeChange?.(0);
        this.onPlaybackEnded?.();
      }
    };
  }

  /**
   * Immediately clears all scheduled/playing audio nodes upon barge-in/interruption.
   */
  clear(): void {
    this.remainder = null;
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore already stopped source
      }
    }
    this.activeSources.clear();
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
    this.onVolumeChange?.(0);
    this.onPlaybackEnded?.();
  }

  close(): void {
    this.clear();
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
