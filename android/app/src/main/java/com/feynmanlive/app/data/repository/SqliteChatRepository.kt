package com.feynmanlive.app.data.repository

import android.content.ContentValues
import android.content.Context
import com.feynmanlive.app.data.db.FeynmanDatabaseHelper
import com.feynmanlive.app.domain.model.Chat
import com.feynmanlive.app.domain.model.ChatId
import com.feynmanlive.app.domain.model.ChatMessage
import com.feynmanlive.app.domain.model.ChatRole
import com.feynmanlive.app.domain.model.ChatWithMessages
import com.feynmanlive.app.domain.model.NewChatDraft
import com.feynmanlive.app.domain.model.StudyContext
import com.feynmanlive.app.domain.repository.ChatRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class SqliteChatRepository(
    private val context: Context,
    private val dbHelper: FeynmanDatabaseHelper = FeynmanDatabaseHelper(context),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ChatRepository {

    private val changeNotifier = MutableSharedFlow<Unit>(replay = 1).apply {
        tryEmit(Unit)
    }

    private fun notifyChanged() {
        changeNotifier.tryEmit(Unit)
    }

    override fun observeChats(): Flow<List<Chat>> = flow {
        changeNotifier.collect {
            emit(queryAllChats())
        }
    }.distinctUntilChanged().flowOn(ioDispatcher)

    override fun observeChat(chatId: ChatId): Flow<ChatWithMessages?> = flow {
        changeNotifier.collect {
            emit(getChat(chatId))
        }
    }.distinctUntilChanged().flowOn(ioDispatcher)

    override suspend fun getChat(chatId: ChatId): ChatWithMessages? = withContext(ioDispatcher) {
        val db = dbHelper.readableDatabase

        var chat: Chat? = null
        db.query(
            "chats",
            null,
            "id = ?",
            arrayOf(chatId.value),
            null,
            null,
            null
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                chat = Chat(
                    id = ChatId(cursor.getString(cursor.getColumnIndexOrThrow("id"))),
                    title = cursor.getString(cursor.getColumnIndexOrThrow("title")),
                    context = StudyContext(
                        tutorPrompt = cursor.getString(cursor.getColumnIndexOrThrow("tutorPrompt")),
                        studyMaterial = cursor.getString(cursor.getColumnIndexOrThrow("studyMaterial")),
                    ),
                    voice = cursor.getString(cursor.getColumnIndexOrThrow("voice")),
                    createdAt = cursor.getLong(cursor.getColumnIndexOrThrow("createdAt")),
                    updatedAt = cursor.getLong(cursor.getColumnIndexOrThrow("updatedAt")),
                )
            }
        }

        if (chat == null) return@withContext null

        val messages = mutableListOf<ChatMessage>()
        db.query(
            "messages",
            null,
            "chatId = ?",
            arrayOf(chatId.value),
            null,
            null,
            "sequence ASC"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                messages.add(
                    ChatMessage(
                        id = com.feynmanlive.app.domain.model.MessageId(cursor.getString(cursor.getColumnIndexOrThrow("id"))),
                        chatId = chatId,
                        role = ChatRole.valueOf(cursor.getString(cursor.getColumnIndexOrThrow("role"))),
                        sequence = cursor.getLong(cursor.getColumnIndexOrThrow("sequence")),
                        text = cursor.getString(cursor.getColumnIndexOrThrow("text")),
                        audioPath = cursor.getString(cursor.getColumnIndexOrThrow("audioPath")),
                        audioDurationMs = if (cursor.isNull(cursor.getColumnIndexOrThrow("audioDurationMs"))) null else cursor.getLong(cursor.getColumnIndexOrThrow("audioDurationMs")),
                        createdAt = cursor.getLong(cursor.getColumnIndexOrThrow("createdAt")),
                    )
                )
            }
        }

        val loadedChat = chat ?: return@withContext null
        ChatWithMessages(chat = loadedChat, messages = messages)
    }

    private fun queryAllChats(): List<Chat> {
        val db = dbHelper.readableDatabase
        val list = mutableListOf<Chat>()
        db.query(
            "chats",
            null,
            null,
            null,
            null,
            null,
            "updatedAt DESC"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                list.add(
                    Chat(
                        id = ChatId(cursor.getString(cursor.getColumnIndexOrThrow("id"))),
                        title = cursor.getString(cursor.getColumnIndexOrThrow("title")),
                        context = StudyContext(
                            tutorPrompt = cursor.getString(cursor.getColumnIndexOrThrow("tutorPrompt")),
                            studyMaterial = cursor.getString(cursor.getColumnIndexOrThrow("studyMaterial")),
                        ),
                        voice = cursor.getString(cursor.getColumnIndexOrThrow("voice")),
                        createdAt = cursor.getLong(cursor.getColumnIndexOrThrow("createdAt")),
                        updatedAt = cursor.getLong(cursor.getColumnIndexOrThrow("updatedAt")),
                    )
                )
            }
        }
        return list
    }

    override suspend fun create(draft: NewChatDraft): Chat = withContext(ioDispatcher) {
        val db = dbHelper.writableDatabase

        val now = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()

        val derivedTitle = draft.title.trim().ifEmpty {
            val firstLine = draft.studyMaterial.trim().lines().firstOrNull()?.trim() ?: ""
            if (firstLine.length > 40) firstLine.take(37) + "..." else firstLine.ifEmpty { "Estudio sin título" }
        }

        val values = ContentValues().apply {
            put("id", id)
            put("title", derivedTitle)
            put("tutorPrompt", draft.tutorPrompt.trim())
            put("studyMaterial", draft.studyMaterial.trim())
            put("voice", draft.voice)
            put("createdAt", now)
            put("updatedAt", now)
        }

        db.insertOrThrow("chats", null, values)
        notifyChanged()

        Chat(
            id = ChatId(id),
            title = derivedTitle,
            context = StudyContext(draft.tutorPrompt.trim(), draft.studyMaterial.trim()),
            voice = draft.voice,
            createdAt = now,
            updatedAt = now,
        )
    }

    override suspend fun updateContext(chatId: ChatId, context: StudyContext): Unit = withContext(ioDispatcher) {
        val db = dbHelper.writableDatabase
        val now = System.currentTimeMillis()

        val values = ContentValues().apply {
            put("tutorPrompt", context.tutorPrompt.trim())
            put("studyMaterial", context.studyMaterial.trim())
            put("updatedAt", now)
        }

        db.update("chats", values, "id = ?", arrayOf(chatId.value))
        notifyChanged()
    }

    override suspend fun addMessage(
        chatId: ChatId,
        role: ChatRole,
        text: String,
        audioPath: String?,
        audioDurationMs: Long?,
    ): ChatMessage = withContext(ioDispatcher) {
        val db = dbHelper.writableDatabase
        val now = System.currentTimeMillis()
        val messageId = "msg_${now}_${UUID.randomUUID().toString().take(4)}"

        var nextSequence = 1L

        db.beginTransaction()
        try {
            db.rawQuery("SELECT COALESCE(MAX(sequence), 0) + 1 FROM messages WHERE chatId = ?", arrayOf(chatId.value)).use { cursor ->
                if (cursor.moveToFirst()) {
                    nextSequence = cursor.getLong(0)
                }
            }

            val values = ContentValues().apply {
                put("id", messageId)
                put("chatId", chatId.value)
                put("sequence", nextSequence)
                put("role", role.name)
                put("text", text.trim())
                put("audioPath", audioPath)
                if (audioDurationMs != null) {
                    put("audioDurationMs", audioDurationMs)
                } else {
                    putNull("audioDurationMs")
                }
                put("createdAt", now)
            }
            db.insertOrThrow("messages", null, values)

            val chatUpdate = ContentValues().apply {
                put("updatedAt", now)
            }
            db.update("chats", chatUpdate, "id = ?", arrayOf(chatId.value))

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        notifyChanged()

        ChatMessage(
            id = com.feynmanlive.app.domain.model.MessageId(messageId),
            chatId = chatId,
            role = role,
            sequence = nextSequence,
            text = text.trim(),
            audioPath = audioPath,
            audioDurationMs = audioDurationMs,
            createdAt = now,
        )
    }

    override suspend fun delete(chatId: ChatId): Unit = withContext(ioDispatcher) {
        val db = dbHelper.writableDatabase
        db.beginTransaction()
        try {
            db.delete("chats", "id = ?", arrayOf(chatId.value))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        // Delete associated audio files
        val chatAudioDir = File(this@SqliteChatRepository.context.filesDir, "chats/${chatId.value}")
        if (chatAudioDir.exists()) {
            chatAudioDir.deleteRecursively()
        }

        notifyChanged()
    }
}
