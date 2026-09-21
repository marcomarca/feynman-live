# Feynman Live v0.1.8

Resiliencia integral de voz, preservación incondicional de audio grabado ante caídas del servidor, búfer en reconexión, mitigación de cierres por timeout (código 1008) y eliminación del modal de fallback intrusivo.

## Novedades y correcciones principales

* **Cero Pérdida de Voz del Usuario**:
  * Ante cualquier desconexión, error de red o interrupción del WebSocket antes de que el servidor devuelva la transcripción en vivo, el audio del usuario ya no se descarta.
  * La grabación de voz se almacena de inmediato en el historial de la conversación como archivo WAV de alta fidelidad, con reproductor integrado en el chat y texto temporal `🎙️ [Mensaje de voz grabado]`.
  * Se implementó un servicio asíncrono de rescate (`AudioTranscriptionRescueService`) que solicita la transcripción en segundo plano usando la API de Gemini (`gemini-2.5-flash`), actualizando automáticamente el mensaje en el chat tan pronto como está disponible.

* **Reconexión con Búfer de Audio en Tiempo Real**:
  * Si la conexión WebSocket entra en estado `reconnecting`, los paquetes de voz capturados por el micrófono se retienen en un búfer en memoria (hasta 30 segundos) y se transmiten automáticamente a Google Generative Language en cuanto la nueva sesión se abre, permitiendo al usuario seguir hablando sin interrupciones.

* **Tratamiento de Cierres de Servidor (Código 1008 / "The operation was aborted")**:
  * Se corrigió `GeminiErrorMapper` para mapear los códigos de cierre WebSocket `1008`, `1001`, `1011`, `1012`, `1013` y mensajes como *"the operation was aborted"* o *"stream reset"* a `CONNECTION_CLOSED` con `retryable: true`.
  * Esto activa inmediatamente la política de recuperación con backoff exponencial en lugar de abortar la sesión a error fatal.

* **Límite Máximo de Turno Continuo en VAD (Turn Bounding de 25s)**:
  * Se incorporó un techo de duración máxima (`maxContinuousSpeechMs = 25000`) en el detector de actividad vocal (`LocalVoiceActivityDetector`).
  * Si el usuario habla continuamente o el ruido de fondo impide detectar pausas por 25 segundos, el detector fuerza el cierre de turno (`audioStreamEnd: true`), permitiendo que el servidor de Gemini procese lo hablado, genere transcripción y evite el aborto por tiempo límite de stream abierto (código 1008).

* **Eliminación del Modal de Fallback Intrusivo**:
  * Se removió la apertura automática del modal de fallback ante caídas de servidor o errores transitorios.
  * Se reemplazó por un banner informativo no bloqueante en la cabecera de la conversación con botón directo de **"Reconectar"**, manteniendo intactos los mensajes y audios del usuario en pantalla.

## Descargas directas

| Plataforma | Tipo de archivo | Enlace de descarga |
|---|---|---|
| **Windows** | `Instalador Setup .exe` | [`Feynman-Live-Setup-0.1.8.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.8/Feynman-Live-Setup-0.1.8.exe) |
| **Windows** | `Portable .exe` | [`Feynman-Live-v0.1.8-windows-portable.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.8/Feynman-Live-v0.1.8-windows-portable.exe) |
| **Android** | `APK .apk` | [`Feynman-Live-v0.1.8-android.apk`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.8/Feynman-Live-v0.1.8-android.apk) |
