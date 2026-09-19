package com.feynmanlive.app.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max

class AndroidPcmRecorder(
    private val sampleRate: Int = 16000,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private var audioRecord: AudioRecord? = null
    private var echoCanceler: AcousticEchoCanceler? = null
    private var noiseSuppressor: NoiseSuppressor? = null
    private var recordingJob: Job? = null
    private var isRecording = false

    private var vad: LocalVoiceActivityDetector? = null

    @SuppressLint("MissingPermission")
    fun start(
        scope: CoroutineScope,
        onAudioChunk: (ByteArray) -> Unit,
        onSpeechStart: () -> Unit,
        onSpeechEnd: () -> Unit,
    ) {
        if (isRecording) return

        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = max(minBuf, 3200)

        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return
        }

        audioRecord = record

        // Attempt to enable acoustic echo cancellation & noise suppression
        val sessionId = record.audioSessionId
        if (AcousticEchoCanceler.isAvailable()) {
            echoCanceler = AcousticEchoCanceler.create(sessionId)?.apply { enabled = true }
        }
        if (NoiseSuppressor.isAvailable()) {
            noiseSuppressor = NoiseSuppressor.create(sessionId)?.apply { enabled = true }
        }

        vad = LocalVoiceActivityDetector(
            minSpeechDurationMs = 150L,
            silenceHangoverMs = 650L,
            onSpeechStart = onSpeechStart,
            onSpeechEnd = onSpeechEnd,
        )

        record.startRecording()
        isRecording = true

        recordingJob = scope.launch(ioDispatcher) {
            val shortBuffer = ShortArray(640) // 40ms at 16kHz
            val byteBuffer = ByteBuffer.allocate(1280).order(ByteOrder.LITTLE_ENDIAN)

            while (isActive && isRecording) {
                val readCount = record.read(shortBuffer, 0, shortBuffer.size)
                if (readCount > 0) {
                    val durationMs = (readCount * 1000L) / sampleRate
                    vad?.processFrame(shortBuffer.copyOf(readCount), durationMs)

                    byteBuffer.clear()
                    for (i in 0 until readCount) {
                        byteBuffer.putShort(shortBuffer[i])
                    }
                    val chunk = ByteArray(readCount * 2)
                    System.arraycopy(byteBuffer.array(), 0, chunk, 0, chunk.size)

                    onAudioChunk(chunk)
                }
            }
        }
    }

    fun forceEndSpeech() {
        vad?.forceEnd()
    }

    fun stop() {
        isRecording = false
        recordingJob?.cancel()
        recordingJob = null

        vad?.forceEnd()
        vad = null

        try {
            audioRecord?.apply {
                if (state == AudioRecord.STATE_INITIALIZED) {
                    stop()
                }
                release()
            }
        } catch (_: Exception) {}
        audioRecord = null

        echoCanceler?.release()
        echoCanceler = null
        noiseSuppressor?.release()
        noiseSuppressor = null
    }
}
