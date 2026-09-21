import { describe, expect, it } from "bun:test";
import { LocalVoiceActivityDetector } from "../../src/renderer/audio/microphone";

describe("LocalVoiceActivityDetector (Unit)", () => {
  function generateTone(samplesCount: number, amplitude: number): Float32Array {
    const samples = new Float32Array(samplesCount);
    for (let i = 0; i < samplesCount; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * amplitude;
    }
    return samples;
  }

  function generateSilence(samplesCount: number): Float32Array {
    return new Float32Array(samplesCount);
  }

  it("should not trigger speech on ambient silence", () => {
    let speechStarted = false;
    let speechEnded = false;

    const vad = new LocalVoiceActivityDetector({
      minSpeechDurationMs: 150,
      silenceHangoverMs: 650,
      onSpeechStart: () => {
        speechStarted = true;
      },
      onSpeechEnd: () => {
        speechEnded = true;
      },
    });

    // 10 frames of 20ms silence
    const silence = generateSilence(320);
    for (let i = 0; i < 10; i++) {
      const res = vad.processFrame(silence, 20);
      expect(res.isVoice).toBe(false);
      expect(res.rms).toBe(0);
    }

    expect(speechStarted).toBe(false);
    expect(speechEnded).toBe(false);
    expect(vad.speechActive).toBe(false);
  });

  it("should reject an isolated click/noise shorter than minSpeechDurationMs", () => {
    let speechStarted = false;

    const vad = new LocalVoiceActivityDetector({
      minSpeechDurationMs: 150,
      silenceHangoverMs: 650,
      onSpeechStart: () => {
        speechStarted = true;
      },
    });

    // 2 frames of 20ms loud click = 40ms (< 150ms minSpeech)
    const click = generateTone(320, 0.5);
    vad.processFrame(click, 20);
    vad.processFrame(click, 20);

    // Followed by silence
    const silence = generateSilence(320);
    vad.processFrame(silence, 20);

    expect(speechStarted).toBe(false);
    expect(vad.speechActive).toBe(false);
  });

  it("should trigger speech start after sustained voice exceeding minSpeechDurationMs", () => {
    let speechStartedCount = 0;

    const vad = new LocalVoiceActivityDetector({
      minSpeechDurationMs: 150,
      silenceHangoverMs: 650,
      onSpeechStart: () => {
        speechStartedCount += 1;
      },
    });

    const voice = generateTone(320, 0.3);

    // 7 frames of 20ms = 140ms (< 150ms)
    for (let i = 0; i < 7; i++) {
      vad.processFrame(voice, 20);
      expect(speechStartedCount).toBe(0);
    }

    // 8th frame: 160ms (>= 150ms)
    const result = vad.processFrame(voice, 20);
    expect(speechStartedCount).toBe(1);
    expect(result.isVoice).toBe(true);
    expect(vad.speechActive).toBe(true);
  });

  it("should maintain voice active during brief pauses and end after silenceHangoverMs", () => {
    let speechStartCount = 0;
    let speechEndCount = 0;

    const vad = new LocalVoiceActivityDetector({
      minSpeechDurationMs: 150,
      silenceHangoverMs: 650,
      onSpeechStart: () => {
        speechStartCount += 1;
      },
      onSpeechEnd: () => {
        speechEndCount += 1;
      },
    });

    const voice = generateTone(320, 0.3);
    const silence = generateSilence(320);

    // Sustained voice: 10 frames of 20ms = 200ms
    for (let i = 0; i < 10; i++) {
      vad.processFrame(voice, 20);
    }
    expect(speechStartCount).toBe(1);
    expect(vad.speechActive).toBe(true);

    // Natural pause of 400ms (20 frames of 20ms < 650ms hangover)
    for (let i = 0; i < 20; i++) {
      vad.processFrame(silence, 20);
    }
    expect(vad.speechActive).toBe(true);
    expect(speechEndCount).toBe(0);

    // Continue silence past 650ms (another 15 frames = 300ms, total 700ms silence)
    for (let i = 0; i < 15; i++) {
      vad.processFrame(silence, 20);
    }

    expect(vad.speechActive).toBe(false);
    expect(speechEndCount).toBe(1);
  });

  it("should forceEnd immediately when speech is active", () => {
    let speechEndCount = 0;

    const vad = new LocalVoiceActivityDetector({
      minSpeechDurationMs: 100,
      silenceHangoverMs: 600,
      onSpeechEnd: () => {
        speechEndCount += 1;
      },
    });

    const voice = generateTone(320, 0.3);
    for (let i = 0; i < 6; i++) {
      vad.processFrame(voice, 20);
    }
    expect(vad.speechActive).toBe(true);

    vad.forceEnd();
    expect(vad.speechActive).toBe(false);
    expect(speechEndCount).toBe(1);

    // Calling forceEnd again when already inactive does nothing
    vad.forceEnd();
    expect(speechEndCount).toBe(1);
  });

  it("should trigger speech end automatically when continuous speech reaches maxContinuousSpeechMs", () => {
    let speechStartCount = 0;
    let speechEndCount = 0;

    const vad = new LocalVoiceActivityDetector({
      minSpeechDurationMs: 100,
      silenceHangoverMs: 600,
      maxContinuousSpeechMs: 1000, // 1 second max continuous speech for fast test
      onSpeechStart: () => {
        speechStartCount += 1;
      },
      onSpeechEnd: () => {
        speechEndCount += 1;
      },
    });

    const voice = generateTone(320, 0.3);

    // Feed 60 frames of 20ms = 1200ms continuous voice (exceeding minSpeech + maxContinuousSpeech)
    for (let i = 0; i < 60; i++) {
      vad.processFrame(voice, 20);
    }

    expect(speechStartCount).toBeGreaterThanOrEqual(1);
    expect(speechEndCount).toBeGreaterThanOrEqual(1);
  });
});
