import { float32ToPcm16, resample } from "./pcm";

export interface MicrophoneCaptureOptions {
  deviceId?: string;
  targetSampleRate?: number;
  chunkSizeMs?: number;
  onAudioChunk: (chunk: Uint8Array) => void;
  onVolumeChange?: (volume: number) => void;
  isAiSpeaking?: () => boolean;
  bargeInThreshold?: number;
}

export class MicrophoneCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private isCapturing = false;

  async start(options: MicrophoneCaptureOptions): Promise<void> {
    if (this.isCapturing) {
      this.stop();
    }

    const targetSampleRate = options.targetSampleRate || 16000;

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      },
      video: false,
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Volume / Analyser
      if (options.onVolumeChange) {
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.sourceNode.connect(this.analyserNode);

        const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
        const checkVolume = () => {
          if (!this.isCapturing || !this.analyserNode) return;
          this.analyserNode.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          options.onVolumeChange?.(Math.min(1, avg / 128));
          this.animFrameId = requestAnimationFrame(checkVolume);
        };
        this.animFrameId = requestAnimationFrame(checkVolume);
      }

      // Buffer size: 4096 samples (~85ms chunks at 48kHz, optimal packet rate without flooding WebSocket)
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        if (!this.isCapturing) return;
        const inputData = event.inputBuffer.getChannelData(0);

        // While AI is speaking, suppress microphone streaming to prevent speaker-to-mic acoustic feedback
        // from falsely triggering server-side VAD barge-in (interrupted: true).
        if (options.isAiSpeaking?.()) {
          return;
        }

        const inputSampleRate = this.audioContext?.sampleRate || 44100;

        const resampled = resample(inputData, inputSampleRate, targetSampleRate);
        const pcm16Chunk = float32ToPcm16(resampled);

        options.onAudioChunk(pcm16Chunk);
      };

      // Connect source to processor, and processor to a muted gain node (gain=0) before destination.
      // This keeps ScriptProcessorNode alive and active without playing mic audio back into speakers!
      this.muteNode = this.audioContext.createGain();
      this.muteNode.gain.value = 0;
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.muteNode);
      this.muteNode.connect(this.audioContext.destination);

      this.isCapturing = true;
    } catch (e) {
      this.stop();
      throw e;
    }
  }

  stop(): void {
    this.isCapturing = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.muteNode) {
      this.muteNode.disconnect();
      this.muteNode = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  get capturing(): boolean {
    return this.isCapturing;
  }
}
