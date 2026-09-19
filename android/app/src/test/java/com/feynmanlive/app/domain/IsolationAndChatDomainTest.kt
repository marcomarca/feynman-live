package com.feynmanlive.app.domain

import com.feynmanlive.app.domain.model.Chat
import com.feynmanlive.app.domain.model.ChatId
import com.feynmanlive.app.domain.model.ChatMessage
import com.feynmanlive.app.domain.model.ChatRole
import com.feynmanlive.app.domain.model.ChatWithMessages
import com.feynmanlive.app.domain.model.NewChatDraft
import com.feynmanlive.app.domain.model.StudyContext
import com.feynmanlive.app.domain.repository.ChatRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * In-memory repository implementing ChatRepository to test domain invariants in pure JVM unit tests.
 */
class InMemoryChatRepository : ChatRepository {
    private val chatsMap = mutableMapOf<String, Chat>()
    private val messagesMap = mutableMapOf<String, MutableList<ChatMessage>>()
    private val chatsFlow = MutableStateFlow<List<Chat>>(emptyList())

    private fun updateFlow() {
        chatsFlow.value = chatsMap.values.sortedByDescending { it.updatedAt }
    }

    override fun observeChats(): Flow<List<Chat>> = chatsFlow

    override fun observeChat(chatId: ChatId): Flow<ChatWithMessages?> = chatsFlow.map {
        getChat(chatId)
    }

    override suspend fun getChat(chatId: ChatId): ChatWithMessages? {
        val chat = chatsMap[chatId.value] ?: return null
        val msgs = messagesMap[chatId.value] ?: emptyList()
        return ChatWithMessages(chat, msgs)
    }

    override suspend fun create(draft: NewChatDraft): Chat {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val title = draft.title.ifBlank { "Estudio" }
        val chat = Chat(
            id = ChatId(id),
            title = title,
            context = StudyContext(draft.tutorPrompt, draft.studyMaterial),
            voice = draft.voice,
            createdAt = now,
            updatedAt = now,
        )
        chatsMap[id] = chat
        messagesMap[id] = mutableListOf()
        updateFlow()
        return chat
    }

    override suspend fun updateContext(chatId: ChatId, context: StudyContext) {
        val existing = chatsMap[chatId.value] ?: return
        val updated = existing.copy(context = context, updatedAt = System.currentTimeMillis())
        chatsMap[chatId.value] = updated
        updateFlow()
    }

    override suspend fun addMessage(
        chatId: ChatId,
        role: ChatRole,
        text: String,
        audioPath: String?,
        audioDurationMs: Long?,
    ): ChatMessage {
        val list = messagesMap.getOrPut(chatId.value) { mutableListOf() }
        val seq = (list.maxOfOrNull { it.sequence } ?: 0L) + 1L
        val msg = ChatMessage(
            id = com.feynmanlive.app.domain.model.MessageId(UUID.randomUUID().toString()),
            chatId = chatId,
            role = role,
            sequence = seq,
            text = text,
            audioPath = audioPath,
            audioDurationMs = audioDurationMs,
            createdAt = System.currentTimeMillis(),
        )
        list.add(msg)
        chatsMap[chatId.value]?.let {
            chatsMap[chatId.value] = it.copy(updatedAt = System.currentTimeMillis())
        }
        updateFlow()
        return msg
    }

    override suspend fun delete(chatId: ChatId) {
        chatsMap.remove(chatId.value)
        messagesMap.remove(chatId.value)
        updateFlow()
    }
}

class IsolationAndChatDomainTest {

    @Test
    fun `initial new chat draft has empty prompt and material by invariant`() {
        val draft = NewChatDraft(voice = "Puck")
        assertTrue("El prompt debe iniciar vacío", draft.tutorPrompt.isEmpty())
        assertTrue("El material debe iniciar vacío", draft.studyMaterial.isEmpty())
        assertEquals("Puck", draft.voice)
    }

    @Test
    fun `creating chat B after chat A does not inherit prompt, material or messages`() = runTest {
        val repo = InMemoryChatRepository()

        // Create Chat A with its own material and prompt
        val chatA = repo.create(
            NewChatDraft(
                title = "Física A",
                tutorPrompt = "Tutor para Física A",
                studyMaterial = "Material de Newton A",
                voice = "Puck",
            )
        )
        repo.addMessage(chatA.id, ChatRole.USER, "Pregunta sobre A")
        repo.addMessage(chatA.id, ChatRole.MODEL, "Respuesta sobre A")

        // Create Chat B independently
        val chatB = repo.create(
            NewChatDraft(
                title = "Química B",
                tutorPrompt = "Tutor para Química B",
                studyMaterial = "Material de Termodinámica B",
                voice = "Charon",
            )
        )

        // Strict isolation checks
        assertNotEquals(chatA.id.value, chatB.id.value)
        assertNotEquals(chatA.context.tutorPrompt, chatB.context.tutorPrompt)
        assertNotEquals(chatA.context.studyMaterial, chatB.context.studyMaterial)

        val loadedA = repo.getChat(chatA.id)
        val loadedB = repo.getChat(chatB.id)

        assertNotNull(loadedA)
        assertNotNull(loadedB)

        assertEquals(2, loadedA!!.messages.size)
        assertEquals(0, loadedB!!.messages.size) // Chat B must have ZERO messages from A!

        // Editing A does not alter B
        repo.updateContext(chatA.id, StudyContext("Nuevo prompt A", "Nuevo material A"))
        val updatedA = repo.getChat(chatA.id)
        val untouchedB = repo.getChat(chatB.id)

        assertEquals("Nuevo prompt A", updatedA!!.chat.context.tutorPrompt)
        assertEquals("Tutor para Química B", untouchedB!!.chat.context.tutorPrompt)

        // Deleting A does not delete B
        repo.delete(chatA.id)
        assertNull(repo.getChat(chatA.id))
        assertNotNull(repo.getChat(chatB.id))
    }

    @Test
    fun `messages maintain sequential monotonic order per chat`() = runTest {
        val repo = InMemoryChatRepository()
        val chat = repo.create(NewChatDraft(title = "Test", tutorPrompt = "P", studyMaterial = "M", voice = "Puck"))

        val m1 = repo.addMessage(chat.id, ChatRole.USER, "Msg 1")
        val m2 = repo.addMessage(chat.id, ChatRole.MODEL, "Msg 2")
        val m3 = repo.addMessage(chat.id, ChatRole.USER, "Msg 3")

        assertEquals(1L, m1.sequence)
        assertEquals(2L, m2.sequence)
        assertEquals(3L, m3.sequence)

        val loaded = repo.getChat(chat.id)
        assertEquals(listOf(1L, 2L, 3L), loaded?.messages?.map { it.sequence })
    }
}
