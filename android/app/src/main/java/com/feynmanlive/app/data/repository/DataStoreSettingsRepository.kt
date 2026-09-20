package com.feynmanlive.app.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.feynmanlive.app.domain.model.AppSettings
import com.feynmanlive.app.domain.repository.SettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "feynman_settings")

class DataStoreSettingsRepository(private val context: Context) : SettingsRepository {

    private object PreferencesKeys {
        val DEFAULT_VOICE = stringPreferencesKey("default_voice")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val INCLUDE_HISTORY_ON_RESUME = booleanPreferencesKey("include_history_on_resume")
        val MODEL_NAME = stringPreferencesKey("model_name")
        val DIAGNOSTICS_ENABLED = booleanPreferencesKey("diagnostics_enabled")
    }

    override val settings: Flow<AppSettings> = context.dataStore.data.map { preferences ->
        AppSettings(
            defaultVoice = preferences[PreferencesKeys.DEFAULT_VOICE] ?: "Puck",
            themeMode = preferences[PreferencesKeys.THEME_MODE] ?: "SYSTEM",
            includeHistoryOnResume = preferences[PreferencesKeys.INCLUDE_HISTORY_ON_RESUME] ?: true,
            modelName = preferences[PreferencesKeys.MODEL_NAME]
                ?.takeIf { !it.contains("transcribe") }
                ?: "gemini-3.1-flash-live-preview",
            diagnosticsEnabled = preferences[PreferencesKeys.DIAGNOSTICS_ENABLED] ?: false,
        )
    }

    override suspend fun update(settings: AppSettings) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.DEFAULT_VOICE] = settings.defaultVoice
            preferences[PreferencesKeys.THEME_MODE] = settings.themeMode
            preferences[PreferencesKeys.INCLUDE_HISTORY_ON_RESUME] = settings.includeHistoryOnResume
            preferences[PreferencesKeys.MODEL_NAME] = settings.modelName
            preferences[PreferencesKeys.DIAGNOSTICS_ENABLED] = settings.diagnosticsEnabled
        }
    }

    override suspend fun getSettings(): AppSettings {
        return settings.first()
    }
}
