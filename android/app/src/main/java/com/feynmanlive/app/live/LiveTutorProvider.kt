package com.feynmanlive.app.live

import kotlinx.coroutines.flow.Flow

sealed interface LiveEvent {
    data class AudioChunk(val pcm24k: ByteArray) : LiveEvent
    data class TextDelta(val text: String) : LiveEvent
    data class UserTranscription(val text: String) : LiveEvent
    object ServerAck : LiveEvent
    object ModelOutputStarted : LiveEvent
    object TurnComplete : LiveEvent
    object Interrupted : LiveEvent
    data class SessionResumptionUpdate(val handle: String) : LiveEvent
    object GoAway : LiveEvent
    data class Error(val code: String, val message: String, val retryable: Boolean = true) : LiveEvent
    object Closed : LiveEvent
}

data class LiveConnectConfig(
    val tutorPrompt: String,
    val studyMaterial: String,
    val voice: String = "Puck",
    val modelName: String = "gemini-3.1-flash-live-preview",
    val conversationHistory: List<Pair<String, String>> = emptyList(),
    val apiKey: String? = null,
)

interface LiveTutorProvider {
    val events: Flow<LiveEvent>
    suspend fun connect(config: LiveConnectConfig): Result<Unit>
    suspend fun sendAudio(pcm16: ByteArray)
    suspend fun endAudioStream()
    suspend fun sendText(text: String): Result<Unit>
    suspend fun close()
    fun isConnected(): Boolean
    fun getConnectionGeneration(): Long
}
