package com.feynmanlive.app.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sin

class LocalVoiceActivityDetectorTest {

    private fun generateTone(samplesCount: Int, amplitude: Float): ShortArray {
        val samples = ShortArray(samplesCount)
        for (i in 0 until samplesCount) {
            val sample = sin((2.0 * Math.PI * 440.0 * i) / 16000.0) * amplitude
            samples[i] = (sample * 32767.0).toInt().coerceIn(-32768, 32767).toShort()
        }
        return samples
    }

    private fun generateSilence(samplesCount: Int): ShortArray {
        return ShortArray(samplesCount)
    }

    @Test
    fun `does not trigger speech on ambient silence`() {
        var speechStarted = false
        var speechEnded = false

        val vad = LocalVoiceActivityDetector(
            minSpeechDurationMs = 150L,
            silenceHangoverMs = 650L,
            onSpeechStart = { speechStarted = true },
            onSpeechEnd = { speechEnded = true },
        )

        val silence = generateSilence(320)
        for (i in 0 until 10) {
            val res = vad.processFrame(silence, 20L)
            assertFalse(res.isVoice)
            assertEquals(0.0f, res.rms, 0.001f)
        }

        assertFalse(speechStarted)
        assertFalse(speechEnded)
        assertFalse(vad.speechActive)
    }

    @Test
    fun `rejects isolated click noise shorter than minSpeechDurationMs`() {
        var speechStarted = false

        val vad = LocalVoiceActivityDetector(
            minSpeechDurationMs = 150L,
            silenceHangoverMs = 650L,
            onSpeechStart = { speechStarted = true },
        )

        val click = generateTone(320, 0.6f)
        vad.processFrame(click, 20L)
        vad.processFrame(click, 20L)

        val silence = generateSilence(320)
        vad.processFrame(silence, 20L)

        assertFalse(speechStarted)
        assertFalse(vad.speechActive)
    }

    @Test
    fun `triggers speech start after sustained voice exceeding minSpeechDurationMs`() {
        var speechStartedCount = 0

        val vad = LocalVoiceActivityDetector(
            minSpeechDurationMs = 150L,
            silenceHangoverMs = 650L,
            onSpeechStart = { speechStartedCount++ },
        )

        val voice = generateTone(320, 0.4f)

        // 7 frames of 20ms = 140ms (< 150ms)
        for (i in 0 until 7) {
            vad.processFrame(voice, 20L)
            assertEquals(0, speechStartedCount)
        }

        // 8th frame: 160ms (>= 150ms)
        val result = vad.processFrame(voice, 20L)
        assertEquals(1, speechStartedCount)
        assertTrue(result.isVoice)
        assertTrue(vad.speechActive)
    }

    @Test
    fun `maintains voice active during brief pauses and ends after silenceHangoverMs`() {
        var speechStartCount = 0
        var speechEndCount = 0

        val vad = LocalVoiceActivityDetector(
            minSpeechDurationMs = 150L,
            silenceHangoverMs = 650L,
            onSpeechStart = { speechStartCount++ },
            onSpeechEnd = { speechEndCount++ },
        )

        val voice = generateTone(320, 0.4f)
        val silence = generateSilence(320)

        // 10 frames of 20ms = 200ms voice
        for (i in 0 until 10) {
            vad.processFrame(voice, 20L)
        }
        assertEquals(1, speechStartCount)
        assertTrue(vad.speechActive)

        // Brief pause of 400ms (20 frames of 20ms < 650ms hangover)
        for (i in 0 until 20) {
            vad.processFrame(silence, 20L)
        }
        assertTrue(vad.speechActive)
        assertEquals(0, speechEndCount)

        // Continue silence for another 300ms (total 700ms > 650ms hangover)
        for (i in 0 until 15) {
            vad.processFrame(silence, 20L)
        }

        assertFalse(vad.speechActive)
        assertEquals(1, speechEndCount)
    }

    @Test
    fun `forceEnd immediately resets speech state`() {
        var speechEndCount = 0

        val vad = LocalVoiceActivityDetector(
            minSpeechDurationMs = 100L,
            silenceHangoverMs = 600L,
            onSpeechEnd = { speechEndCount++ },
        )

        val voice = generateTone(320, 0.4f)
        for (i in 0 until 6) {
            vad.processFrame(voice, 20L)
        }
        assertTrue(vad.speechActive)

        vad.forceEnd()
        assertFalse(vad.speechActive)
        assertEquals(1, speechEndCount)

        // Calling again does not re-emit
        vad.forceEnd()
        assertEquals(1, speechEndCount)
    }
}
