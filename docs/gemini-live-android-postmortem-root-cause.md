# Post-Mortem y Análisis de Causa Raíz: Cadena de Errores en Gemini Live (Android)

**Fecha**: 2026-09-19  
**Alcance**: Implementación de Gemini Live WebSocket en Android (`feynman-live/android`) en comparación con la versión de Electron.  
**Estado**: Resuelto y validado en dispositivo (`M2102J20SG`).

---

## 1. Resumen Ejecutivo

Durante la migración y puesta a punto de Gemini Live en Android (`gemini-3.1-flash-live-preview`), la sesión de chat permanecía indefinidamente en estado **"Pensando..."**, no procesaba texto ni audio, y tras 15 segundos entraba en un bucle continuo de **"Reconectando..."**, a pesar de que la prueba diagnóstica paso a paso pasaba exitosamente.

El fallo no se debió a un único problema de red, sino a una **cadena acumulada de 6 errores arquitectónicos, de protocolo y de inyección de dependencias**, donde las primeras hipótesis asumieron erróneamente problemas de cuota o soporte del modelo cuando los fallos radicaban en la máquina de estados local y el cableado del hardware.

---

## 2. Cronología y Cadena de Errores Cometidos

```
[Error 1: Endpoint y Frames Binarios]
       │
       ▼
[Error 2: Inyección Nula en AppContainer (Hardware Huérfano)]
       │
       ▼
[Error 3: Emisión Prematura de ServerAck en onOpen / setupComplete]
       │
       ▼
[Error 4: Máquina de Estados Forzada en "Pensando..." + Watchdog B (15s)]
       │
       ▼
[Error 5: Descarte Silencioso de Audio y VAD Bloqueado]
       │
       ▼
[Error 6: Condición de Carrera en connect() y Esquema de Chunks v1beta]
```

### Detalle de cada eslabón:

### Error 1: Endpoint WebSocket y recepción de frames binarios
- **Error cometido**: Inicialmente se utilizó el endpoint `v1alpha` con lectura exclusiva de mensajes de texto en OkHttp (`onMessage(ws, text: String)`).
- **Causa técnica**: La API Bidi de Google en `v1beta` transmite frames binarios WebSocket (Opcode 2). Al no sobreescribir `onMessage(ws, bytes: ByteString)`, todas las respuestas del servidor eran descartadas en silencio por OkHttp.
- **Resolución**: Migración a `v1beta` y decodificación explícita de `ByteString.utf8()` en `GeminiLiveWebSocketProvider.kt` y `GeminiApiTester.kt`.

---

### Error 2: Hardware huérfano (Micro y Parlante en `null` en `AppContainer.kt`)
- **Error cometido**: En `DefaultAppContainer.kt`, `StudySessionCoordinator` se instanció con los parámetros por defecto para `recorder` y `player`, dejando ambos en `null`:
  ```kotlin
  // Código defectuoso:
  StudySessionCoordinator(
      context = context,
      chatRepository = chatRepository,
      provider = liveTutorProvider,
      secretStore = secretStore,
      settingsRepository = settingsRepository,
      // recorder = null (por omisión)
      // player = null (por omisión)
  )
  ```
- **Consecuencia**: Las clases de audio (`AndroidPcmRecorder` a 16 kHz y `AndroidPcmPlayer` a 24 kHz) estaban implementadas en el proyecto pero **nunca se ejecutaban**. Al iniciar la sesión, `recorder?.start()` y `player?.writeChunk()` no hacían absolutamente nada. El teléfono nunca activó el micrófono ni abrió el canal de salida de voz.
- **Resolución**: Inyección explícita de `AndroidPcmRecorder()` y `AndroidPcmPlayer()` en `AppContainer.kt`.

---

### Error 3 y 4: Emisión espuria de `ServerAck` y bucle de desconexión por Watchdog B
- **Error cometido**: En `GeminiLiveWebSocketProvider.kt` se emitía `LiveEvent.ServerAck` al abrir el WebSocket (`onOpen`) y al recibir la confirmación de configuración (`setupComplete`):
  ```kotlin
  // Código defectuoso en GeminiLiveWebSocketProvider.kt:
  webSocket.send(setupJson.toString())
  scope.launch { _events.emit(LiveEvent.ServerAck) } // ¡ERROR!

  if (json.has("setupComplete")) {
      scope.launch { _events.emit(LiveEvent.ServerAck) } // ¡ERROR!
  }
  ```
- **Consecuencia**: En `StudySessionCoordinator.kt`, `LiveEvent.ServerAck` está diseñado para confirmar que el servidor **recibió la entrada del usuario**. Al recibirlo durante la inicialización (cuando el usuario no había hablado ni escrito):
  1. Forzaba el estado a `SessionStatus.AwaitingModelOutput` ("Pensando...").
  2. Arrancaba `WatchdogB` con un timeout de 15 segundos (`timeouts.startTimeoutMs = 15000L`).
  3. Como ningún mensaje de usuario había sido enviado, el modelo nunca respondía.
  4. A los 15 segundos, `WatchdogB` disparaba `handleWatchdogBTriggered()`, cerrando el socket y ordenando reconexión (`Reconnecting`).
  5. Al reconectar, se repetía el ciclo exactamente cada 15 segundos.

---

### Error 5: Bloqueo total de entrada de voz
- **Error cometido / Efecto dominó**: Debido a que la sesión quedaba atrapada en `SessionStatus.AwaitingModelOutput`:
  - `handleSpeechStart()` contiene la guardia:
    `if (s !is SessionStatus.Listening && s !is SessionStatus.ModelSpeaking) return`
  - `handleIncomingAudioChunk()` contiene la guardia:
    `if (currentStatus is SessionStatus.Listening || currentStatus is SessionStatus.UserSpeaking)`
- **Consecuencia**: Cualquier intento del usuario de hablar al micrófono era ignorado y los bytes eran descartados antes de llegar al WebSocket.

---

### Error 6: Condición de carrera en `connect()` y descarte silencioso de texto
- **Error cometido**: `GeminiLiveWebSocketProvider.connect()` llamaba a `client.newWebSocket()` y retornaba `Result.success(Unit)` de forma síncrona en 2 ms, sin esperar que el handshake TCP/TLS ni el frame `setupComplete` finalizaran.
- **Consecuencia**: Cuando el usuario abría el chat y pulsaba "Enviar", `ChatScreen.kt` ejecutaba:
  ```kotlin
  if (sessionStatus is SessionStatus.Idle) {
      coordinator.start(ChatId(chatId), scope)
  }
  coordinator.sendText(toSend)
  ```
  `coordinator.start()` retornaba de inmediato. `coordinator.sendText()` ejecutaba `if (!connected.get()) return Result.failure(...)`. Como el handshake toma ~500 ms, `connected` era `false`, el texto se descartaba silenciosamente y la UI nunca enviaba la pregunta.
- **Resolución**: `connect()` ahora suspende con un `CompletableDeferred<Unit>` con timeout de 15s hasta recibir `setupComplete`. Solo retorna `Result.success` cuando el canal bidireccional está 100% operativo.

---

### Error 7: Formato de carga útil obsoleto (`mediaChunks`) y cierre de turno inválido
- **Error cometido**:
  1. `sendAudio()` usaba `realtimeInput.mediaChunks` (obsoleto en `v1beta`; la API exige `realtimeInput.audio: { mimeType, data }`).
  2. `endAudioStream()` enviaba un frame `clientContent: { turnComplete: true }`, lo cual rompía la semántica de streaming de audio en tiempo real.
- **Resolución**: Alineación con el adaptador probado de Electron ([`GeminiLiveAdapter.ts`](file:///d:/apps-2026/feynman-live/src/adapters/gemini/GeminiLiveAdapter.ts)):
  - Audio: `{ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: base64 } } }`
  - Fin de audio: `{ realtimeInput: { audioStreamEnd: true } }`

---

## 3. Matriz de Cambios Aplicados en la Última Iteración

| Archivo | Cambio realizado | Problema que soluciona |
|---|---|---|
| [`AppContainer.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/AppContainer.kt) | Instanciación e inyección de `AndroidPcmRecorder` y `AndroidPcmPlayer`. | El hardware de micrófono y parlante nunca se encendía (`null`). |
| [`GeminiLiveWebSocketProvider.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/live/GeminiLiveWebSocketProvider.kt) | Eliminación de `LiveEvent.ServerAck` en `onOpen` y `setupComplete`. | Detiene el estado falso de "Pensando..." y el loop de reconexión cada 15s. |
| [`GeminiLiveWebSocketProvider.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/live/GeminiLiveWebSocketProvider.kt) | `connect()` suspende con `CompletableDeferred` hasta recibir `setupComplete`. | Elimina la condición de carrera donde `sendText()` se descartaba por socket no listo. |
| [`GeminiLiveWebSocketProvider.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/live/GeminiLiveWebSocketProvider.kt) | `sendAudio` usa `realtimeInput.audio`; `endAudioStream` solo envía `audioStreamEnd`. | Corrige incompatibilidad con la API `v1beta`. |
| [`StudySessionCoordinator.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/live/StudySessionCoordinator.kt) | Guardia en `ServerAck`: solo cambia de estado si `AwaitingServerAck` o `UserSpeaking`. | Evita cambios de estado espurios si llegan ACKs fuera de turno. |
| [`StudySessionCoordinator.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/live/StudySessionCoordinator.kt) | `sendText` crea un `VoiceTurnRuntime`, pasa a `AwaitingModelOutput` y arma `WatchdogB`. | Permite que el chat de texto tenga ciclo de vida y monitoreo de respuesta idéntico a la voz. |
| [`ChatScreen.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/ui/screens/ChatScreen.kt) | Verifica `startRes.isFailure` antes de despachar texto. | Garantiza robustez ante fallos de conexión al primer mensaje. |

---

## 4. Lecciones Aprendidas y Reglas Preventivas

1. **Verificar el contenedor de dependencias antes de depurar la red**: Si una clase funcional no emite logs ni realiza llamadas al sistema, verificar primero si fue inyectada en [`AppContainer.kt`](file:///d:/apps-2026/feynman-live/android/app/src/main/java/com/feynmanlive/app/AppContainer.kt) o si está en `null`.
2. **No emitir eventos semánticos de usuario para eventos de infraestructura**: `setupComplete` es un evento de transporte/configuración. Mapearlo a `ServerAck` corrompió la máquina de estados del usuario.
3. **No asumir retorno síncrono en conexiones asíncronas**: Cualquier método `connect()` debe esperar la confirmación de la capa de aplicación remota antes de considerarse listo.
