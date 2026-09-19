package com.feynmanlive.app.domain.model

@JvmInline
value class ChatId(val value: String)

@JvmInline
value class MessageId(val value: String)

enum class ChatRole {
    USER,
    MODEL,
}

data class StudyContext(
    val tutorPrompt: String,
    val studyMaterial: String,
)

data class Chat(
    val id: ChatId,
    val title: String,
    val context: StudyContext,
    val voice: String,
    val createdAt: Long,
    val updatedAt: Long,
)

data class ChatMessage(
    val id: MessageId,
    val chatId: ChatId,
    val role: ChatRole,
    val sequence: Long,
    val text: String,
    val audioPath: String? = null,
    val audioDurationMs: Long? = null,
    val createdAt: Long,
)

data class ChatWithMessages(
    val chat: Chat,
    val messages: List<ChatMessage>,
)

data class NewChatDraft(
    val title: String = "",
    val tutorPrompt: String = "",
    val studyMaterial: String = "",
    val voice: String = "Puck",
)

data class AppSettings(
    val defaultVoice: String = "Puck",
    val themeMode: String = "SYSTEM",
    val includeHistoryOnResume: Boolean = true,
    val modelName: String = "gemini-3.1-flash-live-preview",
    val diagnosticsEnabled: Boolean = false,
)

data class VoiceTurnRuntime(
    val turnId: Long,
    val connectionGeneration: Long,
    val speechStartedAt: Long,
    var speechEndedAt: Long? = null,
    var audioStreamEndedAt: Long? = null,
    var firstServerAckAt: Long? = null,
    var finalTranscriptAt: Long? = null,
    var firstModelOutputAt: Long? = null,
    var lastServerEventAt: Long? = null,
    var retryCount: Int = 0,
    var serverAcknowledgedInput: Boolean = false,
)
