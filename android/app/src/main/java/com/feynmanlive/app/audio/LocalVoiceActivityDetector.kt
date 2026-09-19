package com.feynmanlive.app.audio

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

data class VadProcessResult(
    val isVoice: Boolean,
    val rms: Float,
    val peak: Float,
)

class LocalVoiceActivityDetector(
    private val minSpeechDurationMs: Long = 150L,
    private val silenceHangoverMs: Long = 650L,
    private val onSpeechStart: (() -> Unit)? = null,
    private val onSpeechEnd: (() -> Unit)? = null,
) {
    private var noiseFloor: Float = 0.008f
    private var isSpeechActive: Boolean = false
    private var speechFramesDurationMs: Long = 0L
    private var silenceFramesDurationMs: Long = 0L

    val speechActive: Boolean
        get() = isSpeechActive

    fun processFrame(samples: ShortArray, durationMs: Long): VadProcessResult {
        var sumSq = 0.0
        var peak = 0.0f

        for (i in samples.indices) {
            val normalized = samples[i] / 32768.0f
            val absVal = abs(normalized)
            if (absVal > peak) peak = absVal
            sumSq += (normalized * normalized)
        }

        val rms = sqrt(sumSq / max(1, samples.size)).toFloat()

        val speechThreshold = max(0.02f, noiseFloor * 2.5f)
        val silenceThreshold = max(0.012f, noiseFloor * 1.5f)

        val isFrameVoice = rms > if (isSpeechActive) silenceThreshold else speechThreshold

        if (!isFrameVoice) {
            noiseFloor = (noiseFloor * 0.95f) + (rms * 0.05f)
        }

        if (isFrameVoice) {
            silenceFramesDurationMs = 0L
            speechFramesDurationMs += durationMs

            if (!isSpeechActive && speechFramesDurationMs >= minSpeechDurationMs) {
                isSpeechActive = true
                onSpeechStart?.invoke()
            }
        } else {
            speechFramesDurationMs = 0L

            if (isSpeechActive) {
                silenceFramesDurationMs += durationMs
                if (silenceFramesDurationMs >= silenceHangoverMs) {
                    isSpeechActive = false
                    silenceFramesDurationMs = 0L
                    onSpeechEnd?.invoke()
                }
            }
        }

        return VadProcessResult(isVoice = isSpeechActive, rms = rms, peak = peak)
    }

    fun forceEnd() {
        if (isSpeechActive) {
            isSpeechActive = false
            speechFramesDurationMs = 0L
            silenceFramesDurationMs = 0L
            onSpeechEnd?.invoke()
        }
    }

    fun reset() {
        isSpeechActive = false
        speechFramesDurationMs = 0L
        silenceFramesDurationMs = 0L
    }
}
