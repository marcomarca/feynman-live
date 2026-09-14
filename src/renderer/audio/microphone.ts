import { float32ToPcm16, resample } from "./pcm";

export interface MicrophoneCaptureOptions {
  deviceId?: string;
  targetSampleRate?: number;
  chunkSizeMs?: number;
  onAudioChunk: (chunk: Uint8Array) => void;
  onVolumeChange?: (volume: number) => void;
}

export class MicrophoneCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
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

      // Buffer size: 2048 or 4096 samples
      const bufferSize = 2048;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        if (!this.isCapturing) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const inputSampleRate = this.audioContext?.sampleRate || 44100;

        const resampled = resample(inputData, inputSampleRate, targetSampleRate);
        const pcm16Chunk = float32ToPcm16(resampled);

        options.onAudioChunk(pcm16Chunk);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

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
