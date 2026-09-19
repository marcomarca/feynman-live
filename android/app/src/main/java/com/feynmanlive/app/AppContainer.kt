package com.feynmanlive.app

import android.content.Context
import com.feynmanlive.app.data.repository.DataStoreSettingsRepository
import com.feynmanlive.app.data.repository.SqliteChatRepository
import com.feynmanlive.app.domain.repository.ChatRepository
import com.feynmanlive.app.domain.repository.SettingsRepository
import com.feynmanlive.app.live.LiveTutorProvider
import com.feynmanlive.app.live.SimulatedLiveTutorProvider
import com.feynmanlive.app.live.StudySessionCoordinator

interface AppContainer {
    val chatRepository: ChatRepository
    val settingsRepository: SettingsRepository
    val liveTutorProvider: LiveTutorProvider
    val studySessionCoordinator: StudySessionCoordinator
}

class DefaultAppContainer(private val context: Context) : AppContainer {
    override val chatRepository: ChatRepository by lazy {
        SqliteChatRepository(context)
    }

    override val settingsRepository: SettingsRepository by lazy {
        DataStoreSettingsRepository(context)
    }

    override val liveTutorProvider: LiveTutorProvider by lazy {
        SimulatedLiveTutorProvider()
    }

    override val studySessionCoordinator: StudySessionCoordinator by lazy {
        StudySessionCoordinator(
            context = context,
            chatRepository = chatRepository,
            provider = liveTutorProvider,
        )
    }
}
