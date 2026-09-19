package com.feynmanlive.app.live

import com.feynmanlive.app.domain.InMemoryChatRepository
import com.feynmanlive.app.domain.model.NewChatDraft
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StudySessionCoordinatorTest {

    @Test
    fun `starts session with chat snapshot and transitions to listening`() = runTest {
        val repo = InMemoryChatRepository()
        val chat = repo.create(
            NewChatDraft(
                title = "Física Cuántica",
                tutorPrompt = "Eres un tutor de física cuántica.",
                studyMaterial = "Efecto fotoeléctrico y dualidad onda-partícula.",
                voice = "Puck",
            )
        )

        val provider = SimulatedLiveTutorProvider(autoRespond = false)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val coordinator = StudySessionCoordinator(
            context = null,
            chatRepository = repo,
            provider = provider,
            recorder = null,
            player = null,
            ioDispatcher = dispatcher,
        )

        val result = coordinator.start(chat.id, this)
        testScheduler.runCurrent()
        assertTrue(result.isSuccess)
        assertEquals(SessionStatus.Listening, coordinator.status.value)

        coordinator.stop()
        testScheduler.runCurrent()
        assertEquals(SessionStatus.Idle, coordinator.status.value)
    }

    @Test
    fun `speech lifecycle transitions from user-speaking to awaiting-server-ack and listening`() = runTest {
        val repo = InMemoryChatRepository()
        val chat = repo.create(NewChatDraft(title = "Test", tutorPrompt = "P", studyMaterial = "M", voice = "Puck"))
        val provider = SimulatedLiveTutorProvider(autoRespond = false)
        val dispatcher = StandardTestDispatcher(testScheduler)

        val coordinator = StudySessionCoordinator(
            context = null,
            chatRepository = repo,
            provider = provider,
            recorder = null,
            player = null,
            timeouts = WatchdogTimeouts(ackTimeoutMs = 500, startTimeoutMs = 500, stalledTimeoutMs = 500),
            ioDispatcher = dispatcher,
        )

        coordinator.start(chat.id, this)
        testScheduler.runCurrent()
        assertEquals(SessionStatus.Listening, coordinator.status.value)

        // User speaks
        coordinator.handleSpeechStart()
        testScheduler.runCurrent()
        assertEquals(SessionStatus.UserSpeaking, coordinator.status.value)
        val turn = coordinator.currentSessionTurn
        assertNotNull(turn)
        assertEquals(1L, turn?.turnId)

        // User finishes speaking
        coordinator.handleSpeechEnd()
        testScheduler.runCurrent()
        assertEquals(SessionStatus.AwaitingServerAck, coordinator.status.value)

        // Server acknowledges and responds
        provider.emitEvent(LiveEvent.ServerAck)
        testScheduler.runCurrent()
        assertEquals(SessionStatus.AwaitingModelOutput, coordinator.status.value)
        assertTrue(coordinator.currentSessionTurn?.serverAcknowledgedInput == true)

        provider.emitEvent(LiveEvent.ModelOutputStarted)
        testScheduler.runCurrent()
        assertEquals(SessionStatus.ModelSpeaking, coordinator.status.value)

        provider.emitEvent(LiveEvent.TextDelta("Explicación del tutor..."))
        testScheduler.runCurrent()
        assertEquals("Explicación del tutor...", coordinator.modelTextDelta.value)

        provider.emitEvent(LiveEvent.TurnComplete)
        testScheduler.runCurrent()
        assertEquals(SessionStatus.Listening, coordinator.status.value)

        coordinator.stop()
        testScheduler.runCurrent()
    }

    @Test
    fun `watchdog A triggers reconnecting when server ack does not arrive in time`() = runTest {
        val repo = InMemoryChatRepository()
        val chat = repo.create(NewChatDraft(title = "Test", tutorPrompt = "P", studyMaterial = "M", voice = "Puck"))
        val provider = SimulatedLiveTutorProvider(autoRespond = false)
        val dispatcher = StandardTestDispatcher(testScheduler)

        val fastTimeouts = WatchdogTimeouts(ackTimeoutMs = 40L, startTimeoutMs = 100L, stalledTimeoutMs = 100L)
        val coordinator = StudySessionCoordinator(
            context = null,
            chatRepository = repo,
            provider = provider,
            recorder = null,
            player = null,
            timeouts = fastTimeouts,
            ioDispatcher = dispatcher,
        )

        coordinator.start(chat.id, this)
        testScheduler.runCurrent()
        coordinator.handleSpeechStart()
        testScheduler.runCurrent()
        coordinator.handleSpeechEnd()
        testScheduler.runCurrent()

        // Wait for Watchdog A (40ms)
        testScheduler.advanceTimeBy(50)
        testScheduler.runCurrent()

        val status = coordinator.status.value
        assertTrue(
            "Debe pasar a Reconnecting o Error ante TURN_ACK_TIMEOUT (actual: $status)",
            status is SessionStatus.Reconnecting || status is SessionStatus.Error || status is SessionStatus.Listening,
        )

        coordinator.stop()
        testScheduler.runCurrent()
    }

    @Test
    fun `watchdog B triggers when model generation does not start in time`() = runTest {
        val repo = InMemoryChatRepository()
        val chat = repo.create(NewChatDraft(title = "Test", tutorPrompt = "P", studyMaterial = "M", voice = "Puck"))
        val provider = SimulatedLiveTutorProvider(autoRespond = false)
        val dispatcher = StandardTestDispatcher(testScheduler)

        val fastTimeouts = WatchdogTimeouts(ackTimeoutMs = 200L, startTimeoutMs = 40L, stalledTimeoutMs = 200L)
        val coordinator = StudySessionCoordinator(
            context = null,
            chatRepository = repo,
            provider = provider,
            recorder = null,
            player = null,
            timeouts = fastTimeouts,
            ioDispatcher = dispatcher,
        )

        coordinator.start(chat.id, this)
        testScheduler.runCurrent()
        coordinator.handleSpeechStart()
        testScheduler.runCurrent()
        coordinator.handleSpeechEnd()
        testScheduler.runCurrent()

        // Server acknowledges promptly
        provider.emitEvent(LiveEvent.ServerAck)
        testScheduler.runCurrent()
        assertEquals(SessionStatus.AwaitingModelOutput, coordinator.status.value)

        // Wait for Watchdog B (40ms)
        testScheduler.advanceTimeBy(50)
        testScheduler.runCurrent()

        val status = coordinator.status.value
        assertTrue(
            "Debe activar recuperación ante MODEL_START_TIMEOUT (actual: $status)",
            status is SessionStatus.Reconnecting || status is SessionStatus.Error || status is SessionStatus.Listening,
        )

        coordinator.stop()
        testScheduler.runCurrent()
    }
}
