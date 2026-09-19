package com.feynmanlive.app.live

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong

class SimulatedLiveTutorProvider(
    private val autoRespond: Boolean = true,
) : LiveTutorProvider {

    private val _events = MutableSharedFlow<LiveEvent>(replay = 0, extraBufferCapacity = 50)
    override val events: Flow<LiveEvent> = _events.asSharedFlow()

    private var connected = false
    private val generation = AtomicLong(1)
    private var lastConfig: LiveConnectConfig? = null

    override suspend fun connect(config: LiveConnectConfig): Result<Unit> {
        connected = true
        lastConfig = config
        generation.incrementAndGet()
        return Result.success(Unit)
    }

    override suspend fun sendAudio(pcm16: ByteArray) {
        // In simulation, received audio chunk is accepted
    }

    override suspend fun endAudioStream() {
        if (!connected || !autoRespond) return

        // Simulate server acknowledgement and tutor response
        CoroutineScope(Dispatchers.Default).launch {
            delay(100)
            _events.emit(LiveEvent.ServerAck)
            _events.emit(LiveEvent.UserTranscription("Entendido. Exploremos el concepto."))

            delay(200)
            _events.emit(LiveEvent.ModelOutputStarted)
            _events.emit(LiveEvent.TextDelta("Muy bien. Para empezar con la técnica Feynman, explícame este concepto con tus propias palabras."))

            // Generate synthetic 24kHz audio (short silent tone)
            val syntheticPcm24k = ByteArray(2400)
            _events.emit(LiveEvent.AudioChunk(syntheticPcm24k))

            delay(300)
            _events.emit(LiveEvent.TurnComplete)
        }
    }

    override suspend fun sendText(text: String): Result<Unit> {
        if (!connected) return Result.failure(IllegalStateException("No conectado"))

        CoroutineScope(Dispatchers.Default).launch {
            delay(100)
            _events.emit(LiveEvent.ServerAck)
            _events.emit(LiveEvent.ModelOutputStarted)
            _events.emit(LiveEvent.TextDelta("He recibido tu mensaje: '$text'. Sigamos profundizando."))
            _events.emit(LiveEvent.TurnComplete)
        }
        return Result.success(Unit)
    }

    override suspend fun close() {
        connected = false
        _events.emit(LiveEvent.Closed)
    }

    override fun isConnected(): Boolean = connected

    override fun getConnectionGeneration(): Long = generation.get()

    // Test emitter helpers
    suspend fun emitEvent(event: LiveEvent) {
        _events.emit(event)
    }
}
