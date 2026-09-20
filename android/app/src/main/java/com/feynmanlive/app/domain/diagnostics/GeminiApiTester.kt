package com.feynmanlive.app.domain.diagnostics

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

enum class DiagnosticStepStatus {
    IDLE,
    RUNNING,
    SUCCESS,
    FAILURE,
}

data class DiagnosticStep(
    val id: String,
    val title: String,
    val status: DiagnosticStepStatus = DiagnosticStepStatus.IDLE,
    val detail: String? = null,
)

data class DiagnosticReport(
    val steps: List<DiagnosticStep>,
    val isRunning: Boolean = false,
    val recommendedModel: String? = null,
    val availableBidiModels: List<String> = emptyList(),
)

class GeminiApiTester(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build(),
) {
    companion object {
        private const val TAG = "GeminiApiTester"
        val FALLBACK_BIDI_MODELS = listOf(
            "gemini-3.1-flash-live-preview",
            "gemini-2.5-flash-native-audio-latest",
            "gemini-2.0-flash-realtime-exp",
        )
    }

    private val initialSteps = listOf(
        DiagnosticStep("rest_auth", "1. Verificación de API Key y Modelos (REST)"),
        DiagnosticStep("ws_handshake", "2. Conexión WebSocket (Handshake HTTP 101)"),
        DiagnosticStep("setup_config", "3. Validación del Modelo y Setup Frame"),
        DiagnosticStep("bidi_echo", "4. Transmisión Bidireccional de Prueba"),
    )

    private val _report = MutableStateFlow(DiagnosticReport(steps = initialSteps))
    val report: StateFlow<DiagnosticReport> = _report.asStateFlow()

    private fun updateStep(id: String, status: DiagnosticStepStatus, detail: String? = null) {
        val current = _report.value
        val updatedSteps = current.steps.map { step ->
            if (step.id == id) step.copy(status = status, detail = detail) else step
        }
        _report.value = current.copy(steps = updatedSteps)
    }

    suspend fun runFullDiagnostic(apiKey: String, preferredModel: String): DiagnosticReport = withContext(Dispatchers.IO) {
        val key = apiKey.trim()
        Log.i(TAG, "=== INICIANDO DIAGNÓSTICO DE API DE GEMINI ===")
        _report.value = DiagnosticReport(
            steps = initialSteps,
            isRunning = true,
        )

        if (key.isBlank()) {
            val err = "La API Key está vacía. Ingrésala en Configuración."
            Log.e(TAG, err)
            updateStep("rest_auth", DiagnosticStepStatus.FAILURE, err)
            _report.value = _report.value.copy(isRunning = false)
            return@withContext _report.value
        }

        // ---------------------------------------------------------
        // Paso 1: Verificación REST y Descubrimiento de Modelos
        // ---------------------------------------------------------
        updateStep("rest_auth", DiagnosticStepStatus.RUNNING, "Consultando catálogo de modelos en Google AI...")
        val bidiModels = mutableListOf<String>()
        var chosenModel = preferredModel

        try {
            val listUrl = "https://generativelanguage.googleapis.com/v1beta/models?key=$key"
            Log.i(TAG, "[Paso 1] Consultando ListModels: $listUrl")
            val restRequest = Request.Builder().url(listUrl).get().build()
            val restResponse = client.newCall(restRequest).execute()
            val body = restResponse.body?.string() ?: ""

            Log.i(TAG, "[Paso 1] HTTP ${restResponse.code} respuesta recibida")

            if (!restResponse.isSuccessful) {
                val errorMsg = try {
                    val errJson = JSONObject(body).getJSONObject("error")
                    errJson.optString("message", "Error HTTP ${restResponse.code}")
                } catch (_: Exception) {
                    "Error HTTP ${restResponse.code}: ${restResponse.message}"
                }
                Log.e(TAG, "[Paso 1] Fallo de autenticación: $errorMsg")
                updateStep("rest_auth", DiagnosticStepStatus.FAILURE, "Fallo de autenticación: $errorMsg")
                _report.value = _report.value.copy(isRunning = false)
                return@withContext _report.value
            }

            val json = JSONObject(body)
            val modelsArray = json.optJSONArray("models") ?: JSONArray()
            val allModelNames = mutableListOf<String>()

            for (i in 0 until modelsArray.length()) {
                val m = modelsArray.getJSONObject(i)
                val name = m.optString("name").removePrefix("models/")
                allModelNames.add(name)
                val methods = m.optJSONArray("supportedGenerationMethods")
                val methodList = mutableListOf<String>()
                if (methods != null) {
                    for (j in 0 until methods.length()) {
                        methodList.add(methods.getString(j))
                    }
                }
                if (methodList.contains("bidiGenerateContent") || name.contains("realtime")) {
                    bidiModels.add(name)
                }
            }

            Log.i(TAG, "[Paso 1] Todos los modelos encontrados: ${allModelNames.joinToString(", ")}")
            Log.i(TAG, "[Paso 1] Modelos con bidiGenerateContent: ${bidiModels.joinToString(", ")}")

            // Los modelos Live preview (como gemini-3.1-flash-live-preview) no son expuestos por el endpoint REST de ListModels,
            // pero están activos en el WebSocket v1beta. Los agregamos a la lista disponible.
            for (m in FALLBACK_BIDI_MODELS) {
                if (!bidiModels.contains(m)) {
                    bidiModels.add(0, m)
                }
            }

            val audioLiveModels = bidiModels.filter { !it.contains("transcribe") }
            chosenModel = if (preferredModel.isNotBlank() && !preferredModel.contains("transcribe")) {
                preferredModel
            } else when {
                audioLiveModels.contains("gemini-3.1-flash-live-preview") -> "gemini-3.1-flash-live-preview"
                audioLiveModels.contains("gemini-2.5-flash-native-audio-latest") -> "gemini-2.5-flash-native-audio-latest"
                audioLiveModels.isNotEmpty() -> audioLiveModels.first()
                else -> "gemini-3.1-flash-live-preview"
            }

            Log.i(TAG, "[Paso 1] Modelos de audio detectados: ${audioLiveModels.joinToString(", ")}")
            Log.i(TAG, "[Paso 1] Modelo seleccionado para prueba: $chosenModel")

            updateStep(
                "rest_auth",
                DiagnosticStepStatus.SUCCESS,
                "API Key válida. Modelo Live compatible detectado: $chosenModel"
            )
            _report.value = _report.value.copy(recommendedModel = chosenModel, availableBidiModels = audioLiveModels)
        } catch (e: Exception) {
            Log.e(TAG, "[Paso 1] Excepción en REST: ${e.message}", e)
            updateStep("rest_auth", DiagnosticStepStatus.FAILURE, "Error de conexión REST: ${e.localizedMessage}")
            _report.value = _report.value.copy(isRunning = false)
            return@withContext _report.value
        }

        // ---------------------------------------------------------
        // Paso 2: Conexión WebSocket Handshake
        // ---------------------------------------------------------
        updateStep("ws_handshake", DiagnosticStepStatus.RUNNING, "Iniciando WebSocket con wss://generativelanguage.googleapis.com...")

        val wsUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=$key"
        Log.i(TAG, "[Paso 2] Conectando a $wsUrl")
        val wsRequest = Request.Builder().url(wsUrl).build()

        var activeWs: WebSocket? = null
        val wsOpened = AtomicBoolean(false)
        val setupConfirmed = AtomicBoolean(false)
        val textReceived = AtomicBoolean(false)
        var wsError: String? = null
        var responseText = ""

        try {
            val wsTestResult = withTimeoutOrNull(20000L) {
                suspendCancellableCoroutine<Boolean> { continuation ->
                    val listener = object : WebSocketListener() {
                        override fun onOpen(webSocket: WebSocket, response: Response) {
                            activeWs = webSocket
                            wsOpened.set(true)
                            Log.i(TAG, "[Paso 2] WebSocket HTTP ${response.code} conectado.")
                            updateStep("ws_handshake", DiagnosticStepStatus.SUCCESS, "Handshake HTTP 101 Switching Protocols exitoso.")

                            // ---------------------------------------------------------
                            // Paso 3: Envío de Setup Frame (AUDIO requerido por Bidi API)
                            // ---------------------------------------------------------
                            val formattedModel = if (chosenModel.startsWith("models/")) chosenModel else "models/$chosenModel"
                            Log.i(TAG, "[Paso 3] Enviando setup frame con modelo: $formattedModel y responseModalities: [AUDIO]")
                            updateStep("setup_config", DiagnosticStepStatus.RUNNING, "Enviando frame setup con modelo: $formattedModel...")

                            val setupPayload = JSONObject().apply {
                                put("setup", JSONObject().apply {
                                    put("model", formattedModel)
                                    put("generationConfig", JSONObject().apply {
                                        put("responseModalities", JSONArray().apply { put("AUDIO") })
                                        put("speechConfig", JSONObject().apply {
                                            put("voiceConfig", JSONObject().apply {
                                                put("prebuiltVoiceConfig", JSONObject().apply {
                                                    put("voiceName", "Puck")
                                                })
                                            })
                                        })
                                    })
                                    put("systemInstruction", JSONObject().apply {
                                        put("parts", JSONArray().apply {
                                            put(JSONObject().apply { put("text", "Responde brevemente.") })
                                        })
                                    })
                                    put("inputAudioTranscription", JSONObject())
                                    put("outputAudioTranscription", JSONObject())
                                })
                            }
                            webSocket.send(setupPayload.toString())
                        }

                        private fun handleFrame(text: String, webSocket: WebSocket) {
                            Log.i(TAG, "[WebSocket Incoming] ${text.take(400)}")
                            try {
                                val msgJson = JSONObject(text)

                                if (msgJson.has("setupComplete")) {
                                    setupConfirmed.set(true)
                                    Log.i(TAG, "[Paso 3] setupComplete confirmado!")
                                    updateStep("setup_config", DiagnosticStepStatus.SUCCESS, "Google confirmó setupComplete para '$chosenModel'.")

                                    // ---------------------------------------------------------
                                    // Paso 4: Enviar mensaje de prueba (Echo)
                                    // ---------------------------------------------------------
                                    Log.i(TAG, "[Paso 4] Enviando mensaje de prueba: 'Hola'")
                                    updateStep("bidi_echo", DiagnosticStepStatus.RUNNING, "Enviando mensaje de prueba: 'Hola'...")

                                    val testTurn = JSONObject().apply {
                                        put("clientContent", JSONObject().apply {
                                            put("turns", JSONArray().apply {
                                                put(JSONObject().apply {
                                                    put("role", "user")
                                                    put("parts", JSONArray().apply {
                                                        put(JSONObject().apply { put("text", "Hola") })
                                                    })
                                                })
                                            })
                                            put("turnComplete", true)
                                        })
                                    }
                                    webSocket.send(testTurn.toString())
                                }

                                if (msgJson.has("serverContent")) {
                                    val serverContent = msgJson.getJSONObject("serverContent")

                                    // Capturar transcripción de texto o chunks de audio
                                    var receivedAnyPart = false
                                    if (serverContent.has("modelTurn")) {
                                        val parts = serverContent.getJSONObject("modelTurn").optJSONArray("parts")
                                        if (parts != null && parts.length() > 0) {
                                            for (k in 0 until parts.length()) {
                                                val p = parts.getJSONObject(k)
                                                if (p.has("text")) {
                                                    responseText += p.getString("text")
                                                    receivedAnyPart = true
                                                }
                                                if (p.has("inlineData")) {
                                                    receivedAnyPart = true
                                                }
                                            }
                                        }
                                    }

                                    val outTranscription = when {
                                        serverContent.has("outputTranscription") -> serverContent.getJSONObject("outputTranscription").optString("text")
                                        serverContent.has("outputAudioTranscription") -> serverContent.getJSONObject("outputAudioTranscription").optString("text")
                                        else -> null
                                    }
                                    if (!outTranscription.isNullOrBlank()) {
                                        responseText += " $outTranscription"
                                        receivedAnyPart = true
                                    }

                                    if (receivedAnyPart) {
                                        textReceived.set(true)
                                        val msg = if (responseText.isNotBlank()) "Respuesta recibida: '$responseText'" else "Audio y respuesta recibida de Google Gemini."
                                        Log.i(TAG, "[Paso 4] Éxito: $msg")
                                        updateStep("bidi_echo", DiagnosticStepStatus.SUCCESS, msg)
                                        if (!continuation.isCompleted) {
                                            continuation.resume(true)
                                        }
                                    }
                                }

                                if (msgJson.has("error")) {
                                    val err = msgJson.getJSONObject("error")
                                    wsError = err.optString("message", "Error de Gemini API")
                                    Log.e(TAG, "[WebSocket Error] $wsError")
                                    if (!continuation.isCompleted) {
                                        continuation.resume(false)
                                    }
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error procesando frame entrante: ${e.message}", e)
                            }
                        }

                        override fun onMessage(webSocket: WebSocket, text: String) {
                            handleFrame(text, webSocket)
                        }

                        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                            handleFrame(bytes.utf8(), webSocket)
                        }

                        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                            val codeMsg = if (response != null) " (HTTP ${response.code}: ${response.message})" else ""
                            wsError = (t.localizedMessage ?: "Fallo de conexión") + codeMsg
                            Log.e(TAG, "[Paso 2/3 Failure] $wsError", t)
                            if (!continuation.isCompleted) {
                                continuation.resume(false)
                            }
                        }

                        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                            Log.w(TAG, "[WebSocket onClosing] code=$code, reason=$reason")
                            if (code != 1000) {
                                wsError = "Cierre de Google (código $code): $reason"
                                if (!continuation.isCompleted) {
                                    continuation.resume(false)
                                }
                            }
                        }
                    }

                    val ws = client.newWebSocket(wsRequest, listener)
                    continuation.invokeOnCancellation {
                        ws.close(1000, "Cancelado")
                    }
                }
            }

            if (wsTestResult == null || wsTestResult == false) {
                val detailErr = wsError ?: "Tiempo de espera agotado sin respuesta del servidor."
                Log.w(TAG, "Diagnóstico terminado sin éxito: $detailErr")
                if (!wsOpened.get()) {
                    updateStep("ws_handshake", DiagnosticStepStatus.FAILURE, detailErr)
                } else if (!setupConfirmed.get()) {
                    updateStep("setup_config", DiagnosticStepStatus.FAILURE, detailErr)
                } else if (!textReceived.get()) {
                    updateStep("bidi_echo", DiagnosticStepStatus.FAILURE, detailErr)
                }
            }
        } catch (e: Exception) {
            val err = e.localizedMessage ?: "Error inesperado en diagnóstico"
            Log.e(TAG, "Excepción en diagnóstico: $err", e)
            if (!wsOpened.get()) {
                updateStep("ws_handshake", DiagnosticStepStatus.FAILURE, err)
            } else if (!setupConfirmed.get()) {
                updateStep("setup_config", DiagnosticStepStatus.FAILURE, err)
            } else {
                updateStep("bidi_echo", DiagnosticStepStatus.FAILURE, err)
            }
        } finally {
            try {
                activeWs?.close(1000, "Diagnóstico completado")
            } catch (_: Exception) {}
        }

        _report.value = _report.value.copy(isRunning = false)
        Log.i(TAG, "=== DIAGNÓSTICO FINALIZADO ===")
        return@withContext _report.value
    }
}
