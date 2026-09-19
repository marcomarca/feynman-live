package com.feynmanlive.app.ui.navigation

sealed interface AppRoute {
    object ChatList : AppRoute
    object NewChat : AppRoute
    data class Chat(val chatId: String) : AppRoute
    data class ChatContext(val chatId: String) : AppRoute
    object Settings : AppRoute
}
