import { pcm16ToFloat32 } from "./pcm";

export interface PlaybackOptions {
  sampleRate?: number;
  onVolumeChange?: (volume: number) => void;
}

export class AudioPlaybackQueue {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private sampleRate = 24000;
  private onVolumeChange?: (volume: number) => void;

  constructor(options?: PlaybackOptions) {
    this.sampleRate = options?.sampleRate || 24000;
    this.onVolumeChange = options?.onVolumeChange;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )({
        sampleRate: this.sampleRate,
      });
      this.nextStartTime = this.audioContext.currentTime;
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  enqueuePcm16(pcm16Bytes: Uint8Array): void {
    if (pcm16Bytes.length === 0) return;

    const ctx = this.ensureContext();
    const float32Samples = pcm16ToFloat32(pcm16Bytes);

    // Calculate RMS volume for visual indicator
    if (this.onVolumeChange && float32Samples.length > 0) {
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
    // Schedule seamlessly
    const startTime = Math.max(currentTime, this.nextStartTime);
    sourceNode.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    this.activeSources.add(sourceNode);

    sourceNode.onended = () => {
      this.activeSources.delete(sourceNode);
      sourceNode.disconnect();
      if (this.activeSources.size === 0) {
        this.onVolumeChange?.(0);
      }
    };
  }

  /**
   * Immediately clears all scheduled/playing audio nodes upon barge-in/interruption.
   */
  clear(): void {
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
  }

  close(): void {
    this.clear();
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
