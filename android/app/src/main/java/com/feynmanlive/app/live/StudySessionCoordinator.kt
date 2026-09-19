package com.feynmanlive.app.live

import android.content.Context
import com.feynmanlive.app.audio.AndroidPcmPlayer
import com.feynmanlive.app.audio.AndroidPcmRecorder
import com.feynmanlive.app.audio.WavEncoder
import com.feynmanlive.app.domain.compiler.StudyContextCompiler
import com.feynmanlive.app.domain.model.ChatId
import com.feynmanlive.app.domain.model.ChatMessage
import com.feynmanlive.app.domain.model.ChatRole
import com.feynmanlive.app.domain.model.VoiceTurnRuntime
import com.feynmanlive.app.domain.repository.ChatRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File

sealed interface SessionStatus {
    object Idle : SessionStatus
    object Connecting : SessionStatus
    object Listening : SessionStatus
    object UserSpeaking : SessionStatus
    object AwaitingServerAck : SessionStatus
    object AwaitingModelOutput : SessionStatus
    object ModelSpeaking : SessionStatus
    data class Reconnecting(val attempt: Int, val maxAttempts: Int) : SessionStatus
    data class Error(val code: String, val message: String) : SessionStatus
    object Stopping : SessionStatus
}

data class WatchdogTimeouts(
    val ackTimeoutMs: Long = 5000L,
    val startTimeoutMs: Long = 10000L,
    val stalledTimeoutMs: Long = 15000L,
)

class StudySessionCoordinator(
    private val context: Context? = null,
    private val chatRepository: ChatRepository,
    private val provider: LiveTutorProvider,
    private val recorder: AndroidPcmRecorder? = null,
    private val player: AndroidPcmPlayer? = null,
    private val timeouts: WatchdogTimeouts = WatchdogTimeouts(),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val audioBaseDir: File? = null,
    private val secretStore: com.feynmanlive.app.domain.repository.SecretStore? = null,
) {
    private val _status = MutableStateFlow<SessionStatus>(SessionStatus.Idle)
    val status: StateFlow<SessionStatus> = _status.asStateFlow()

    private val _modelTextDelta = MutableStateFlow("")
    val modelTextDelta: StateFlow<String> = _modelTextDelta.asStateFlow()

    private val _userTranscription = MutableStateFlow("")
    val userTranscription: StateFlow<String> = _userTranscription.asStateFlow()

    private var activeChatId: ChatId? = null
    private var scope: CoroutineScope? = null

    private var currentTurn: VoiceTurnRuntime? = null
    private var activeTurnId = 0L

    private val userAudioBuffer = mutableListOf<ByteArray>()
    private var userAudioBytes = 0
    private val MAX_USER_AUDIO_BYTES = 30 * 16000 * 2 // 960,000 bytes

    private val modelAudioStream = ByteArrayOutputStream()
    private val modelTextAccumulator = StringBuilder()
    private val userTextAccumulator = StringBuilder()

    private var watchdogAJob: Job? = null
    private var watchdogBJob: Job? = null
    private var watchdogCJob: Job? = null

    private var reconnectAttempt = 0
    private val MAX_RECONNECT_ATTEMPTS = 3
    private var isMuted = false
    private var eventsCollectorJob: Job? = null

    val currentSessionTurn: VoiceTurnRuntime?
        get() = currentTurn

    suspend fun start(chatId: ChatId, coroutineScope: CoroutineScope): Result<Unit> {
        if (_status.value !is SessionStatus.Idle && _status.value !is SessionStatus.Error) {
            return Result.success(Unit)
        }

        activeChatId = chatId
        scope = coroutineScope
        reconnectAttempt = 0
        isMuted = false
        _status.value = SessionStatus.Connecting

        // Load chat context specifically for this chat
        val chatWithMessages = chatRepository.getChat(chatId)
            ?: run {
                _status.value = SessionStatus.Error("CHAT_NOT_FOUND", "El chat especificado no existe.")
                return Result.failure(IllegalArgumentException("Chat no encontrado: ${chatId.value}"))
            }

        val compiledPrompt = StudyContextCompiler.compile(chatWithMessages.chat.context)
        val history = chatWithMessages.messages
            .filter { it.text.isNotBlank() }
            .map { it.role.name to it.text }

        val apiKey = secretStore?.getApiKey()
        val config = LiveConnectConfig(
            tutorPrompt = compiledPrompt,
            studyMaterial = chatWithMessages.chat.context.studyMaterial,
            voice = chatWithMessages.chat.voice,
            conversationHistory = history,
            apiKey = apiKey,
        )

        val connectResult = provider.connect(config)
        if (connectResult.isFailure) {
            _status.value = SessionStatus.Error("CONNECTION_FAILED", connectResult.exceptionOrNull()?.message ?: "Error al conectar")
            return connectResult
        }

        // Start player and recorder
        player?.start(coroutineScope)
        startRecording(coroutineScope)

        // Listen for provider events
        eventsCollectorJob?.cancel()
        eventsCollectorJob = coroutineScope.launch(ioDispatcher) {
            provider.events.collect { event ->
                handleLiveEvent(event)
            }
        }

        _status.value = SessionStatus.Listening
        return Result.success(Unit)
    }

    private fun startRecording(coroutineScope: CoroutineScope) {
        recorder?.start(
            scope = coroutineScope,
            onAudioChunk = { chunk ->
                handleIncomingAudioChunk(chunk)
            },
            onSpeechStart = {
                handleSpeechStart()
            },
            onSpeechEnd = {
                handleSpeechEnd()
            },
        )
    }

    private fun handleIncomingAudioChunk(chunk: ByteArray) {
        if (isMuted) return
        val currentStatus = _status.value
        if (currentStatus is SessionStatus.Listening || currentStatus is SessionStatus.UserSpeaking) {
            userAudioBuffer.add(chunk)
            userAudioBytes += chunk.size

            while (userAudioBytes > MAX_USER_AUDIO_BYTES && userAudioBuffer.size > 1) {
                val removed = userAudioBuffer.removeAt(0)
                userAudioBytes -= removed.size
            }

            scope?.launch(ioDispatcher) {
                provider.sendAudio(chunk)
            }
        }
    }

    fun handleSpeechStart() {
        val s = _status.value
        if (s !is SessionStatus.Listening && s !is SessionStatus.ModelSpeaking) return

        if (s is SessionStatus.ModelSpeaking) {
            clearWatchdogs()
            player?.flush()
            flushModelMessage()
        }

        activeTurnId++
        currentTurn = VoiceTurnRuntime(
            turnId = activeTurnId,
            connectionGeneration = provider.getConnectionGeneration(),
            speechStartedAt = System.currentTimeMillis(),
            retryCount = 0,
            serverAcknowledgedInput = false,
        )

        userAudioBuffer.clear()
        userAudioBytes = 0
        userTextAccumulator.clear()
        _status.value = SessionStatus.UserSpeaking
    }

    fun handleSpeechEnd() {
        currentTurn?.speechEndedAt = System.currentTimeMillis()
        currentTurn?.audioStreamEndedAt = System.currentTimeMillis()

        scope?.launch(ioDispatcher) {
            provider.endAudioStream()
        }

        _status.value = SessionStatus.AwaitingServerAck
        startWatchdogA()
    }

    private suspend fun handleLiveEvent(event: LiveEvent) {
        when (event) {
            is LiveEvent.UserTranscription -> {
                clearWatchdogA()
                currentTurn?.apply {
                    serverAcknowledgedInput = true
                    finalTranscriptAt = System.currentTimeMillis()
                }
                userTextAccumulator.append(" ").append(event.text)
                _userTranscription.value = userTextAccumulator.toString().trim()
                startWatchdogB()
                _status.value = SessionStatus.AwaitingModelOutput
            }

            is LiveEvent.ServerAck -> {
                clearWatchdogA()
                currentTurn?.apply {
                    serverAcknowledgedInput = true
                    if (firstServerAckAt == null) firstServerAckAt = System.currentTimeMillis()
                }
                startWatchdogB()
                _status.value = SessionStatus.AwaitingModelOutput
            }

            is LiveEvent.ModelOutputStarted -> {
                clearWatchdogB()
                startWatchdogC()
                currentTurn?.apply {
                    if (firstModelOutputAt == null) firstModelOutputAt = System.currentTimeMillis()
                }
                _status.value = SessionStatus.ModelSpeaking
                flushUserAudioMessage()
            }

            is LiveEvent.TextDelta -> {
                clearWatchdogB()
                startWatchdogC()
                modelTextAccumulator.append(event.text)
                _modelTextDelta.value = modelTextAccumulator.toString()
                if (_status.value !is SessionStatus.ModelSpeaking) {
                    _status.value = SessionStatus.ModelSpeaking
                    flushUserAudioMessage()
                }
            }

            is LiveEvent.AudioChunk -> {
                clearWatchdogB()
                startWatchdogC()
                modelAudioStream.write(event.pcm24k)
                player?.writeChunk(event.pcm24k)
                if (_status.value !is SessionStatus.ModelSpeaking) {
                    _status.value = SessionStatus.ModelSpeaking
                    flushUserAudioMessage()
                }
            }

            is LiveEvent.TurnComplete -> {
                clearWatchdogs()
                reconnectAttempt = 0 // Reset budget only on turn complete!
                currentTurn = null
                flushModelMessage()
                _modelTextDelta.value = ""
                _userTranscription.value = ""
                _status.value = SessionStatus.Listening
            }

            is LiveEvent.Interrupted -> {
                clearWatchdogs()
                player?.flush()
                currentTurn = null
                flushModelMessage()
                _status.value = SessionStatus.Listening
            }

            is LiveEvent.Error -> {
                clearWatchdogs()
                handleError(event.code, event.message, event.retryable)
            }

            is LiveEvent.Closed -> {
                clearWatchdogs()
                if (_status.value !is SessionStatus.Idle && _status.value !is SessionStatus.Stopping) {
                    handleError("CONNECTION_CLOSED", "Conexión cerrada", true)
                }
            }

            else -> {}
        }
    }

    private fun startWatchdogA() {
        clearWatchdogs()
        watchdogAJob = scope?.launch(ioDispatcher) {
            delay(timeouts.ackTimeoutMs)
            handleWatchdogATriggered()
        }
    }

    private fun startWatchdogB() {
        clearWatchdogA()
        clearWatchdogB()
        watchdogBJob = scope?.launch(ioDispatcher) {
            delay(timeouts.startTimeoutMs)
            handleWatchdogBTriggered()
        }
    }

    private fun startWatchdogC() {
        clearWatchdogA()
        clearWatchdogB()
        watchdogCJob?.cancel()
        watchdogCJob = scope?.launch(ioDispatcher) {
            delay(timeouts.stalledTimeoutMs)
            handleWatchdogCTriggered()
        }
    }

    fun clearWatchdogA() {
        watchdogAJob?.cancel()
        watchdogAJob = null
    }

    fun clearWatchdogB() {
        watchdogBJob?.cancel()
        watchdogBJob = null
    }

    fun clearWatchdogC() {
        watchdogCJob?.cancel()
        watchdogCJob = null
    }

    fun clearWatchdogs() {
        clearWatchdogA()
        clearWatchdogB()
        clearWatchdogC()
    }

    private suspend fun handleWatchdogATriggered() {
        clearWatchdogs()
        val turn = currentTurn
        val retryChunks = if (turn != null && turn.retryCount == 0 && !turn.serverAcknowledgedInput && userAudioBuffer.isNotEmpty()) {
            userAudioBuffer.toList()
        } else null

        turn?.let { it.retryCount += 1 }
        handleError("TURN_ACK_TIMEOUT", "El servidor no confirmó el audio.", true, retryChunks)
    }

    private suspend fun handleWatchdogBTriggered() {
        clearWatchdogs()
        handleError("MODEL_START_TIMEOUT", "El modelo no inició generación.", true)
    }

    private suspend fun handleWatchdogCTriggered() {
        clearWatchdogs()
        flushModelMessage()
        handleError("MODEL_STALLED_TIMEOUT", "Generación de modelo detenida.", true)
    }

    private suspend fun handleError(
        code: String,
        message: String,
        retryable: Boolean,
        retryAudioChunks: List<ByteArray>? = null,
    ) {
        if (!retryable || reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            _status.value = SessionStatus.Error(code, message)
            return
        }

        reconnectAttempt++
        _status.value = SessionStatus.Reconnecting(reconnectAttempt, MAX_RECONNECT_ATTEMPTS)

        val backoffDelay = (reconnectAttempt * 1000L).coerceAtMost(5000L)
        delay(backoffDelay)

        val chatId = activeChatId ?: return
        val chat = chatRepository.getChat(chatId) ?: return

        val apiKey = secretStore?.getApiKey()
        val config = LiveConnectConfig(
            tutorPrompt = StudyContextCompiler.compile(chat.chat.context),
            studyMaterial = chat.chat.context.studyMaterial,
            voice = chat.chat.voice,
            apiKey = apiKey,
        )

        val retryResult = provider.connect(config)
        if (retryResult.isSuccess) {
            _status.value = SessionStatus.Listening

            if (retryAudioChunks != null && retryAudioChunks.isNotEmpty()) {
                for (chunk in retryAudioChunks) {
                    provider.sendAudio(chunk)
                }
                provider.endAudioStream()
                startWatchdogA()
            }
        } else {
            handleError(code, message, retryable)
        }
    }

    private fun flushUserAudioMessage() {
        val chatId = activeChatId ?: return
        val text = userTextAccumulator.toString().trim()
        userTextAccumulator.clear()

        if (text.isEmpty() && userAudioBuffer.isEmpty()) return

        val pcm = if (userAudioBuffer.isNotEmpty()) {
            val totalSize = userAudioBuffer.sumOf { it.size }
            val merged = ByteArray(totalSize)
            var offset = 0
            for (c in userAudioBuffer) {
                System.arraycopy(c, 0, merged, offset, c.size)
                offset += c.size
            }
            userAudioBuffer.clear()
            userAudioBytes = 0
            merged
        } else null

        scope?.launch(ioDispatcher) {
            var audioRelativePath: String? = null
            var audioDurationMs: Long? = null

            val baseDir = audioBaseDir ?: context?.filesDir
            if (pcm != null && pcm.size >= 3200 && baseDir != null) {
                val messageId = "user_audio_${System.currentTimeMillis()}"
                val audioFile = File(baseDir, "chats/${chatId.value}/audio/$messageId.wav")
                WavEncoder.savePcmAsWav(audioFile, pcm, 16000)
                audioRelativePath = "chats/${chatId.value}/audio/$messageId.wav"
                audioDurationMs = WavEncoder.calculateDurationMs(pcm.size.toLong(), 16000)
            }

            if (text.isNotEmpty() || audioRelativePath != null) {
                chatRepository.addMessage(
                    chatId = chatId,
                    role = ChatRole.USER,
                    text = text.ifEmpty { "(Audio sin transcripción)" },
                    audioPath = audioRelativePath,
                    audioDurationMs = audioDurationMs,
                )
            }
        }
    }

    private fun flushModelMessage() {
        val chatId = activeChatId ?: return
        val text = modelTextAccumulator.toString().trim()
        modelTextAccumulator.clear()

        val pcm = modelAudioStream.toByteArray()
        modelAudioStream.reset()

        if (text.isEmpty() && pcm.isEmpty()) return

        scope?.launch(ioDispatcher) {
            var audioRelativePath: String? = null
            var audioDurationMs: Long? = null

            val baseDir = audioBaseDir ?: context?.filesDir
            if (pcm.size >= 2400 && baseDir != null) {
                val messageId = "model_audio_${System.currentTimeMillis()}"
                val audioFile = File(baseDir, "chats/${chatId.value}/audio/$messageId.wav")
                WavEncoder.savePcmAsWav(audioFile, pcm, 24000)
                audioRelativePath = "chats/${chatId.value}/audio/$messageId.wav"
                audioDurationMs = WavEncoder.calculateDurationMs(pcm.size.toLong(), 24000)
            }

            chatRepository.addMessage(
                chatId = chatId,
                role = ChatRole.MODEL,
                text = text,
                audioPath = audioRelativePath,
                audioDurationMs = audioDurationMs,
            )
        }
    }

    suspend fun sendText(text: String): Result<Unit> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return Result.failure(IllegalArgumentException("El texto no puede estar vacío"))
        val chatId = activeChatId ?: return Result.failure(IllegalStateException("No hay chat activo"))

        flushUserAudioMessage()

        chatRepository.addMessage(
            chatId = chatId,
            role = ChatRole.USER,
            text = trimmed,
        )

        return provider.sendText(trimmed)
    }

    fun mute(muted: Boolean) {
        isMuted = muted
        if (muted) {
            clearWatchdogs()
            recorder?.forceEndSpeech()
            scope?.launch(ioDispatcher) {
                provider.endAudioStream()
            }
        }
    }

    suspend fun stop() {
        clearWatchdogs()
        _status.value = SessionStatus.Stopping

        recorder?.stop()
        player?.stop()

        flushModelMessage()
        flushUserAudioMessage()

        eventsCollectorJob?.cancel()
        eventsCollectorJob = null

        provider.close()

        currentTurn = null
        activeChatId = null
        _status.value = SessionStatus.Idle
    }
}
