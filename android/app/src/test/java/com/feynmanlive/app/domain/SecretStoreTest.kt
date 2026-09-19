package com.feynmanlive.app.domain

import com.feynmanlive.app.domain.repository.SecretStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InMemorySecretStore : SecretStore {
    private var key: String? = null

    override suspend fun hasApiKey(): Boolean = !key.isNullOrBlank()

    override suspend fun getApiKey(): String? = key

    override suspend fun saveApiKey(apiKey: String): Result<Unit> {
        val trimmed = apiKey.trim()
        if (trimmed.isEmpty()) {
            return deleteApiKey()
        }
        key = trimmed
        return Result.success(Unit)
    }

    override suspend fun deleteApiKey(): Result<Unit> {
        key = null
        return Result.success(Unit)
    }
}

class SecretStoreTest {

    @Test
    fun `secret store lifecycle handles save, get, and delete cleanly`() = runTest {
        val store = InMemorySecretStore()
        assertFalse(store.hasApiKey())
        assertNull(store.getApiKey())

        val saveRes = store.saveApiKey("  AIzaSyValidRealKey123  ")
        assertTrue(saveRes.isSuccess)
        assertTrue(store.hasApiKey())
        assertEquals("AIzaSyValidRealKey123", store.getApiKey())

        val deleteRes = store.deleteApiKey()
        assertTrue(deleteRes.isSuccess)
        assertFalse(store.hasApiKey())
        assertNull(store.getApiKey())
    }

    @Test
    fun `saving blank key deletes previous key`() = runTest {
        val store = InMemorySecretStore()
        store.saveApiKey("AIzaSyOldKey")
        assertTrue(store.hasApiKey())

        store.saveApiKey("   ")
        assertFalse(store.hasApiKey())
        assertNull(store.getApiKey())
    }
}
