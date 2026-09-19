package com.feynmanlive.app.live

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

class HybridLiveTutorProvider(
    private val liveProvider: LiveTutorProvider = GeminiLiveWebSocketProvider(),
    private val simulatedProvider: LiveTutorProvider = SimulatedLiveTutorProvider(),
) : LiveTutorProvider {

    private val _events = MutableSharedFlow<LiveEvent>(replay = 0, extraBufferCapacity = 100)
    override val events: Flow<LiveEvent> = _events.asSharedFlow()

    private var activeProvider: LiveTutorProvider = simulatedProvider
    private var eventsJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    override suspend fun connect(config: LiveConnectConfig): Result<Unit> {
        val apiKey = config.apiKey?.trim()
        activeProvider = if (!apiKey.isNullOrBlank() && apiKey.length >= 10 && apiKey != "AIzaSyValidKey") {
            liveProvider
        } else {
            simulatedProvider
        }

        eventsJob?.cancel()
        eventsJob = scope.launch {
            activeProvider.events.collect { event ->
                _events.emit(event)
            }
        }

        return activeProvider.connect(config)
    }

    override suspend fun sendAudio(pcm16: ByteArray) {
        activeProvider.sendAudio(pcm16)
    }

    override suspend fun endAudioStream() {
        activeProvider.endAudioStream()
    }

    override suspend fun sendText(text: String): Result<Unit> {
        return activeProvider.sendText(text)
    }

    override suspend fun close() {
        eventsJob?.cancel()
        activeProvider.close()
    }

    override fun isConnected(): Boolean = activeProvider.isConnected()

    override fun getConnectionGeneration(): Long = activeProvider.getConnectionGeneration()
}
