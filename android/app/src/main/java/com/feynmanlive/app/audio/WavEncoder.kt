package com.feynmanlive.app.audio

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

object WavEncoder {

    fun encodePcm16(pcmBytes: ByteArray, sampleRate: Int = 16000, channels: Int = 1): ByteArray {
        val totalAudioLen = pcmBytes.size
        val totalDataLen = totalAudioLen + 36
        val byteRate = sampleRate * channels * 2

        val header = ByteArray(44)
        val buffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)

        // RIFF chunk descriptor
        buffer.put('R'.code.toByte())
        buffer.put('I'.code.toByte())
        buffer.put('F'.code.toByte())
        buffer.put('F'.code.toByte())
        buffer.putInt(totalDataLen)
        buffer.put('W'.code.toByte())
        buffer.put('A'.code.toByte())
        buffer.put('V'.code.toByte())
        buffer.put('E'.code.toByte())

        // fmt sub-chunk
        buffer.put('f'.code.toByte())
        buffer.put('m'.code.toByte())
        buffer.put('t'.code.toByte())
        buffer.put(' '.code.toByte())
        buffer.putInt(16) // SubChunk1Size for PCM
        buffer.putShort(1.toShort()) // AudioFormat (1 = PCM)
        buffer.putShort(channels.toShort())
        buffer.putInt(sampleRate)
        buffer.putInt(byteRate)
        buffer.putShort((channels * 2).toShort()) // BlockAlign
        buffer.putShort(16.toShort()) // BitsPerSample

        // data sub-chunk
        buffer.put('d'.code.toByte())
        buffer.put('a'.code.toByte())
        buffer.put('t'.code.toByte())
        buffer.put('a'.code.toByte())
        buffer.putInt(totalAudioLen)

        val out = ByteArrayOutputStream(44 + totalAudioLen)
        out.write(header)
        out.write(pcmBytes)
        return out.toByteArray()
    }

    fun savePcmAsWav(file: File, pcmBytes: ByteArray, sampleRate: Int = 16000, channels: Int = 1) {
        file.parentFile?.mkdirs()
        val wav = encodePcm16(pcmBytes, sampleRate, channels)
        FileOutputStream(file).use { it.write(wav) }
    }

    fun calculateDurationMs(pcmByteLength: Long, sampleRate: Int = 16000, channels: Int = 1): Long {
        val bytesPerSample = 2
        val bytesPerSec = sampleRate * channels * bytesPerSample
        return if (bytesPerSec > 0) (pcmByteLength * 1000L) / bytesPerSec else 0L
    }
}
