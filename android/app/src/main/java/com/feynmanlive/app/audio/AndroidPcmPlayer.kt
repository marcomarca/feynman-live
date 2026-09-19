package com.feynmanlive.app.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.max

class AndroidPcmPlayer(
    private val sampleRate: Int = 24000,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private var audioTrack: AudioTrack? = null
    private var playbackChannel = Channel<ByteArray>(capacity = 200)
    private var playbackJob: Job? = null
    private var isPlaying = false

    fun start(scope: CoroutineScope) {
        if (isPlaying) return

        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = max(minBuf, 4800)

        val track = AudioTrack(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
            bufferSize,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE,
        )

        audioTrack = track
        track.play()
        isPlaying = true

        playbackJob = scope.launch(ioDispatcher) {
            for (chunk in playbackChannel) {
                if (!isActive || !isPlaying) break
                var written = 0
                while (written < chunk.size && isPlaying) {
                    val res = track.write(chunk, written, chunk.size - written)
                    if (res > 0) {
                        written += res
                    } else {
                        break
                    }
                }
            }
        }
    }

    fun writeChunk(chunk: ByteArray) {
        if (!isPlaying) return
        playbackChannel.trySend(chunk)
    }

    fun flush() {
        try {
            audioTrack?.pause()
            audioTrack?.flush()
            // Drain channel
            while (playbackChannel.tryReceive().isSuccess) {}
            audioTrack?.play()
        } catch (_: Exception) {}
    }

    fun stop() {
        isPlaying = false
        playbackJob?.cancel()
        playbackJob = null

        // Drain channel
        while (playbackChannel.tryReceive().isSuccess) {}

        try {
            audioTrack?.apply {
                pause()
                flush()
                stop()
                release()
            }
        } catch (_: Exception) {}
        audioTrack = null
    }
}
