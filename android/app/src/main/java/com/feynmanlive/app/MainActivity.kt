package com.feynmanlive.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.feynmanlive.app.ui.navigation.AppRoute
import com.feynmanlive.app.ui.screens.ChatContextScreen
import com.feynmanlive.app.ui.screens.ChatListScreen
import com.feynmanlive.app.ui.screens.ChatScreen
import com.feynmanlive.app.ui.screens.NewChatScreen
import com.feynmanlive.app.ui.screens.SettingsScreen
import com.feynmanlive.app.ui.theme.FeynmanLiveTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as FeynmanApplication
        val container = app.container

        setContent {
            FeynmanLiveTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val backStack = remember { mutableStateListOf<AppRoute>(AppRoute.ChatList) }
                    val currentRoute = backStack.lastOrNull() ?: AppRoute.ChatList

                    BackHandler(enabled = backStack.size > 1) {
                        backStack.removeLastOrNull()
                    }

                    when (currentRoute) {
                        is AppRoute.ChatList -> {
                            ChatListScreen(
                                repository = container.chatRepository,
                                onOpenChat = { chatId ->
                                    backStack.add(AppRoute.Chat(chatId))
                                },
                                onNewChat = {
                                    backStack.add(AppRoute.NewChat)
                                },
                                onOpenSettings = {
                                    backStack.add(AppRoute.Settings)
                                },
                            )
                        }

                        is AppRoute.NewChat -> {
                            NewChatScreen(
                                chatRepository = container.chatRepository,
                                settingsRepository = container.settingsRepository,
                                onBack = {
                                    backStack.removeLastOrNull()
                                },
                                onChatCreated = { newChatId ->
                                    // Pop NewChat and navigate directly into Chat
                                    backStack.removeLastOrNull()
                                    backStack.add(AppRoute.Chat(newChatId))
                                },
                            )
                        }

                        is AppRoute.Chat -> {
                            ChatScreen(
                                chatId = currentRoute.chatId,
                                chatRepository = container.chatRepository,
                                coordinator = container.studySessionCoordinator,
                                onBack = {
                                    backStack.removeLastOrNull()
                                },
                                onOpenContext = { id ->
                                    backStack.add(AppRoute.ChatContext(id))
                                },
                                onNavigateToSettings = {
                                    backStack.add(AppRoute.Settings)
                                },
                            )
                        }

                        is AppRoute.ChatContext -> {
                            ChatContextScreen(
                                chatId = currentRoute.chatId,
                                chatRepository = container.chatRepository,
                                onBack = {
                                    backStack.removeLastOrNull()
                                },
                            )
                        }

                        is AppRoute.Settings -> {
                            SettingsScreen(
                                settingsRepository = container.settingsRepository,
                                secretStore = container.secretStore,
                                apiTester = container.geminiApiTester,
                                onBack = {
                                    backStack.removeLastOrNull()
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}
