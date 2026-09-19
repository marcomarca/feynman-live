package com.feynmanlive.app.data.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.feynmanlive.app.domain.repository.SecretStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class AndroidKeystoreSecretStore(
    private val context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : SecretStore {

    private val secretsDir: File
        get() = File(context.filesDir, "secrets").apply { if (!exists()) mkdirs() }

    private val keyFile: File
        get() = File(secretsDir, "gemini_key.bin")

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (entry != null) {
                return entry.secretKey
            }
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER
        )
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    override suspend fun hasApiKey(): Boolean = withContext(ioDispatcher) {
        val key = getApiKey()
        !key.isNullOrBlank()
    }

    override suspend fun getApiKey(): String? = withContext(ioDispatcher) {
        try {
            if (!keyFile.exists()) return@withContext null
            val rawBytes = keyFile.readBytes()
            if (rawBytes.size < 13) return@withContext null

            val ivSize = rawBytes[0].toInt() and 0xFF
            if (rawBytes.size < 1 + ivSize) return@withContext null

            val iv = rawBytes.copyOfRange(1, 1 + ivSize)
            val ciphertext = rawBytes.copyOfRange(1 + ivSize, rawBytes.size)

            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)

            val decrypted = cipher.doFinal(ciphertext)
            String(decrypted, Charsets.UTF_8).trim().ifBlank { null }
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun saveApiKey(apiKey: String): Result<Unit> = withContext(ioDispatcher) {
        try {
            val trimmed = apiKey.trim()
            if (trimmed.isEmpty()) {
                return@withContext deleteApiKey()
            }

            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv ?: return@withContext Result.failure(IllegalStateException("No se pudo generar IV"))
            val ciphertext = cipher.doFinal(trimmed.toByteArray(Charsets.UTF_8))

            val output = ByteArrayOutputStream()
            output.write(iv.size)
            output.write(iv)
            output.write(ciphertext)

            keyFile.writeBytes(output.toByteArray())
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun deleteApiKey(): Result<Unit> = withContext(ioDispatcher) {
        try {
            if (keyFile.exists()) {
                keyFile.delete()
            }
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS)
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "feynman_live_gemini_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
    }
}
