package com.feynmanlive.app.domain.repository

import com.feynmanlive.app.domain.model.AppSettings
import com.feynmanlive.app.domain.model.Chat
import com.feynmanlive.app.domain.model.ChatId
import com.feynmanlive.app.domain.model.ChatMessage
import com.feynmanlive.app.domain.model.ChatRole
import com.feynmanlive.app.domain.model.ChatWithMessages
import com.feynmanlive.app.domain.model.NewChatDraft
import com.feynmanlive.app.domain.model.StudyContext
import kotlinx.coroutines.flow.Flow

interface ChatRepository {
    fun observeChats(): Flow<List<Chat>>
    fun observeChat(chatId: ChatId): Flow<ChatWithMessages?>
    suspend fun getChat(chatId: ChatId): ChatWithMessages?
    suspend fun create(draft: NewChatDraft): Chat
    suspend fun updateContext(chatId: ChatId, context: StudyContext)
    suspend fun addMessage(
        chatId: ChatId,
        role: ChatRole,
        text: String,
        audioPath: String? = null,
        audioDurationMs: Long? = null,
    ): ChatMessage
    suspend fun delete(chatId: ChatId)
}

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun update(settings: AppSettings)
    suspend fun getSettings(): AppSettings
}
