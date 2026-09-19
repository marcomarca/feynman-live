package com.feynmanlive.app.audio

import org.junit.Assert.assertEquals
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class WavEncoderTest {

    @Test
    fun `encodes PCM16 into valid WAV structure with correct headers`() {
        val pcmData = ByteArray(3200) // 100ms at 16kHz 16-bit mono
        for (i in pcmData.indices) {
            pcmData[i] = (i % 128).toByte()
        }

        val wavBytes = WavEncoder.encodePcm16(pcmData, sampleRate = 16000, channels = 1)

        assertEquals(3200 + 44, wavBytes.size)

        // Verify RIFF and WAVE magic headers
        assertEquals('R'.code.toByte(), wavBytes[0])
        assertEquals('I'.code.toByte(), wavBytes[1])
        assertEquals('F'.code.toByte(), wavBytes[2])
        assertEquals('F'.code.toByte(), wavBytes[3])

        assertEquals('W'.code.toByte(), wavBytes[8])
        assertEquals('A'.code.toByte(), wavBytes[9])
        assertEquals('V'.code.toByte(), wavBytes[10])
        assertEquals('E'.code.toByte(), wavBytes[11])

        val buffer = ByteBuffer.wrap(wavBytes).order(ByteOrder.LITTLE_ENDIAN)
        val chunkLen = buffer.getInt(4)
        assertEquals(3200 + 36, chunkLen)

        val audioFormat = buffer.getShort(20)
        assertEquals(1.toShort(), audioFormat) // PCM

        val numChannels = buffer.getShort(22)
        assertEquals(1.toShort(), numChannels)

        val sampleRate = buffer.getInt(24)
        assertEquals(16000, sampleRate)

        val bitsPerSample = buffer.getShort(34)
        assertEquals(16.toShort(), bitsPerSample)

        val dataLen = buffer.getInt(40)
        assertEquals(3200, dataLen)
    }

    @Test
    fun `calculates duration in ms accurately`() {
        // 16000 samples/sec * 2 bytes/sample = 32000 bytes/sec
        // 32000 bytes = 1000 ms
        val duration1s = WavEncoder.calculateDurationMs(32000L, 16000, 1)
        assertEquals(1000L, duration1s)

        val durationHalfSec = WavEncoder.calculateDurationMs(16000L, 16000, 1)
        assertEquals(500L, durationHalfSec)
    }
}
