# Memoria Histórica Integral de Errores, Causas y Soluciones (v0.1.0 — v0.1.3)

> **Documento de Auditoría y Memoria de Ingeniería**  
> **Proyecto:** Feynman Live (Desktop Electron & Android)  
> **Ámbito de auditoría:** Totalidad de commits (25 commits cronológicos, desde `43595ec` hasta `e12801f`)  
> **Fecha:** 2026-09-20  
> **Objetivo:** Registrar exhaustivamente cada fallo técnico, las iteraciones requeridas para resolverlo, la causa raíz oculta y los principios preventivos para blindar versiones futuras.

---

## 1. Registro Cronológico de Commits (Línea de Tiempo Completa)

A continuación se detalla la secuencia temporal de los 25 commits que componen el repositorio, clasificados por subsistema y tipo:

| N° | Hash | Fecha | Tipo | Mensaje del Commit | Subsistema Afectado |
|---|---|---|---|---|---|
| 1 | `43595ec` | 2026-09-13 | `feat` | Implement Feynman Live desktop app with Gemini Live adapter, safe storage, and portable fallback | Arquitectura base / Electron |
| 2 | `2543abd` | 2026-09-13 | `fix` | Use audio payload in sendRealtimeInput and wire workspace .env secret store | Gemini Live / Secrets |
| 3 | `dce0ce9` | 2026-09-13 | `fix` | Resume audio context and flush material debounce on session restart | Web Audio / Debounce |
| 4 | `cf60f1e` | 2026-09-13 | `fix` | Eliminate audio stutter with jitter buffer and echo gating | Audio Streaming / DSP |
| 5 | `f02d322` | 2026-09-13 | `fix` | Warmup audio context on session start to eliminate cold start stutter on first turn | Web Audio / Latencia |
| 6 | `6617431` | 2026-09-13 | `feat` | Implement Google AI Studio chat history, audio persistence, and realtime transcription | Persistencia / History |
| 7 | `edefffd` | 2026-09-13 | `fix` | Restore and polish modal, form, input, and dark theme styles | UI / CSS Tokens |
| 8 | `606d931` | 2026-09-13 | `fix` | Enable speech-to-text transcription and resolve audio player seeking/playback | Transcripción / Audio Player |
| 9 | `0edf4cb` | 2026-09-13 | `fix` | Add media-src blob and data to CSP and mount DOM audio player element | Seguridad CSP / DOM Audio |
| 10 | `cdf6778` | 2026-09-13 | `feat` | Add automatic chat conversation context resumption with UI toggle | Contexto / Sesiones |
| 11 | `a6ff822` | 2026-09-14 | `fix` | Prevent phantom user messages and separate text from voice audio cleanly | State Management / Buffers |
| 12 | `212aefd` | 2026-09-14 | `feat` | Add response modality support for pure text vs audio in Gemini Live | Gemini Protocol / Settings |
| 13 | `05445b7` | 2026-09-14 | `fix` | Apply live modality switch immediately with session restart and prompt directive | Gemini Handshake / Prompts |
| 14 | `283f856` | 2026-09-14 | `feat` | Implement core application architecture with IPC handlers, adapters, and UI components | Core IPC / Dominio |
| 15 | `44cb2e1` | 2026-09-18 | `feat` | Implement Feynman Live application with audio streaming, session management, and React UI | Integración React / Audio |
| 16 | `b540336` | 2026-09-19 | `feat` | Implement gemini live zombie session remediation with VAD and turn watchdogs | Gemini Live / VAD / Watchdogs |
| 17 | `5cf56ab` | 2026-09-19 | `feat` | Implement native android apk with jetpack compose and gemini live coordinator | Android Core / Jetpack |
| 18 | `d61f0cf` | 2026-09-19 | `feat` | Add secure API key storage via Android Keystore and Gemini Live WebSocket provider | Android Seguridad / Keystore |
| 19 | `672c182` | 2026-09-19 | `docs` | Add README.md for feynman-live | Documentación |
| 20 | `c6f60f2` | 2026-09-19 | `feat` | Add Android UI screens, data repositories, and Gemini Live WebSocket integration | Android UI / WebSockets |
| 21 | `43eb66f` | 2026-09-19 | `docs` | Add post-mortem and root cause analysis for Gemini Live Android implementation errors | Android Post-Mortem |
| 22 | `ad2f32f` | 2026-09-20 | `feat` | Add portable build script and Windows target | Build Pipeline / Electron |
| 23 | `1069646` | 2026-09-20 | `feat` | Add explicit leaked and invalid API key error handling with direct settings action | Error Mapping / Auth 1008 |
| 24 | `a781863` | 2026-09-20 | `feat` | Implement background auto-update system for Windows v0.1.2 (Squirrel) | Auto-Update / Squirrel |
| 25 | `e12801f` | 2026-09-20 | `refactor` | Migrate from squirrel to electron-updater (nsis) v0.1.3 | Auto-Update / NSIS / Releases |

---

## 2. Análisis Detallado por Ciclos de Depuración Multi-Iteración

Muchos de los retos del proyecto no pudieron ser resueltos en una única iteración debido a dependencias sutiles entre el runtime de Electron, la API de Google Gemini Live y las restricciones de los sistemas operativos (Windows y Android). A continuación se documenta la anatomía de cada ciclo.

---

### Ciclo 1: Calidad de Audio, Cold-Start y Tartamudeo (Stuttering)
*Commits vinculados:* `dce0ce9` -> `cf60f1e` -> `f02d322` -> `0edf4cb` (4 iteraciones)

#### Síntomas Observados
1. Al pulsar "Iniciar Sesión", el primer turno de voz del modelo se escuchaba entrecortado, con un "chasquido" inicial y saltos de milisegundos.
2. Tras pausar y reanudar, la reproducción se congelaba en silencio absoluto.
3. Los audios persistidos en el historial no reproducían en el reproductor inferior (`AudioPlayerBar`).

#### Hipótesis Iniciales Fallidas
* *Intento 1:* Se asumió que los paquetes PCM llegaban con retraso de red y bastaba con aumentar el búfer en `playback.ts`. Esto incrementó la latencia sin eliminar el corte inicial.
* *Intento 2:* Se pensó que el navegador silenciaba el audio por falta de interacción del usuario. Se forzó `audioContext.resume()` al recibir datos, pero la primera palabra de Gemini ya se había perdido.

#### Causa Raíz Oculta
* **Suspensión por ahorro de energía de Chromium:** Chromium suspende los `AudioContext` inactivos. Inicializar el contexto cuando llega el primer chunk de la red toma entre 80ms y 150ms en encender el motor de hardware de audio en Windows, perdiendo los primeros frames PCM de la respuesta.
* **Falta de Jitter Buffer continuo:** Los WebSockets transmiten chunks de tamaño irregular. Al alimentar directamente `AudioBufferSourceNode` en timestamps ad-hoc, si un chunk se demora 5ms más que el anterior, se produce un "underrun" (vacío de datos), manifestándose como tartamudeo.
* **Bloqueo por CSP (Content Security Policy):** El reproductor de historial generaba URLs `blob:...` para los archivos WAV cacheados en memoria, pero el meta tag CSP en `index.html` restringía `media-src 'self'`, bloqueando silenciosamente la carga del blob en el elemento `<audio>`.

#### Solución Definitiva Implementada
1. **Warmup Proactivo (`f02d322`):** Invocación de `AudioPlaybackQueue.warmup()` inmediatamente al pulsar iniciar sesión, ejecutando un buffer mudo de 1 frame que despierta el hilo de audio del sistema operativo antes de que llegue la respuesta del servidor.
2. **Línea de Tiempo Continua y Jitter Buffer (`cf60f1e`):** Implementación de una cola continua donde cada chunk se programa secuencialmente en `nextStartTime = Math.max(audioContext.currentTime, nextStartTime) + chunkDuration`, uniendo buffers dispares sin micro-silencios.
3. **Echo Gating (`cf60f1e`):** Cierre del paso de captura de micrófono durante la reproducción de audio del modelo para evitar bucles de retroalimentación acústica.
4. **CSP Permisivo para Medios Locales (`0edf4cb`):** Adición de `blob:` y `data:` en la directiva `media-src` de `index.html`.

---

### Ciclo 2: "Mensajes Fantasma" y Separación de Canales de Voz vs Texto
*Commits vinculados:* `cdf6778` -> `a6ff822` (2 iteraciones)

#### Síntomas Observados
Cuando el usuario escribía una pregunta en el campo de texto manual y la enviaba durante una sesión en vivo activa, el modelo respondía en audio pero en el historial de chat aparecían **dos mensajes de usuario**:
1. El texto escrito legítimo.
2. Un mensaje de voz vacío o con transcripción incomprensible atribuido al usuario unos milisegundos después.

#### Hipótesis Iniciales Fallidas
* Se creyó que el componente React `ChatHistory` estaba duplicando renderizados debido a StrictMode o a doble invocación de callbacks en Electron IPC.

#### Causa Raíz Oculta
En `StudySessionService.ts`, el buffer acumulador de audio de micrófono (`currentUserAudioChunks`) no se reiniciaba al despachar un mensaje de texto. Dado que el micrófono seguía abierto capturando ruido ambiental de fondo (teclado, respiración), cuando el modelo finalizaba su turno (`turnComplete`), el servicio ejecutaba la rutina de cierre de turno de voz y guardaba un segundo mensaje con el buffer residual de audio ambiental como si el usuario hubiera hablado simultáneamente.

#### Solución Definitiva Implementada (`a6ff822`)
* Se introdujo una bandera de estado transaccional en `StudySessionService`: al invocar `sendTextMessage()`, se purga inmediatamente el buffer acumulado de audio de voz, se invalidan los frames en tránsito y se marca el turno actual como originado puramente por texto (`turnSource = 'TEXT'`). Se agregó una prueba de integración unitaria específica que previene la creación de este mensaje fantasma.

---

### Ciclo 3: Conmutación en Caliente de Modalidad (Live Modality Switch)
*Commits vinculados:* `212aefd` -> `05445b7` (2 iteraciones)

#### Síntomas Observados
En la pantalla de Configuración existía el selector: "Modalidad de Respuesta: Audio vs Solo Texto". Al cambiarlo a "Solo Texto" durante una llamada activa, el modelo continuaba respondiendo en audio (generando voz).

#### Causa Raíz Oculta
El protocolo bidireccional de Google Gemini Live (`v1alpha` / `v1beta`) negocia los `responseModalities` (`AUDIO` o `TEXT`) **únicamente durante el mensaje de Setup inicial** del WebSocket. Modificar el valor en la base de datos local (`settings.json`) no alteraba la sesión WebSocket ya establecida en memoria.

#### Solución Definitiva Implementada (`05445b7`)
1. Detección de cambio de configuración en `SettingsService`: si la modalidad cambia con una sesión viva en ejecución, se fuerza una reconexión transparente inmediata enviando el nuevo handshake con `responseModalities: ["TEXT"]`.
2. Como refuerzo semántico, se inyecta una directiva explícita en las instrucciones de sistema (`systemInstruction`): *"Si la modalidad es texto, no envíes audio y responde de manera concisa por escrito."*

---

### Ciclo 4: Las "Sesiones Zombi" de Gemini Live (Zombie Sessions)
*Commits vinculados:* `283f856` -> `44cb2e1` -> `b540336` (3 iteraciones mayores)

Este fue el fallo de arquitectura más severo del proyecto, documentado en profundidad en `docs/gemini-live-zombie-session-remediation-plan.md`.

#### Síntomas Observados
La sesión quedaba en un limbo perpetuo:
1. El usuario hablaba, pero el servidor nunca respondía ni cambiaba de estado.
2. El modelo comenzaba a responder y de repente se quedaba a mitad de frase, dejando la interfaz en estado "Hablando..." indefinidamente.
3. El micrófono permanecía bloqueado y no permitía realizar nuevas preguntas.

#### Causa Raíz Oculta
La arquitectura original confiaba ciegamente en que Google siempre enviaría los eventos esperados en orden (`serverContent -> modelTurn -> turnComplete`). En condiciones reales de red:
* **Pérdida de señal de fin de turno:** Si el usuario dejaba de hablar pero el ruido de fondo superaba el umbral del VAD del servidor de Google, Google nunca cerraba el turno de entrada y esperaba infinitamente más audio.
* **Ausencia de VAD local en cliente:** El cliente transmitía PCM de forma ininterrumpida sin saber cuándo el usuario había callado.
* **Falta de Watchdogs:** No existían temporizadores para detectar si el servidor había aceptado el turno, si había comenzado a generar tokens o si la generación se había atascado a la mitad.

#### Solución Definitiva Implementada (`b540336`)
1. **Detector Local de Actividad de Voz (`LocalVoiceActivityDetector`):**
   - Análisis de energía RMS en ventanas de 20ms en el cliente.
   - Umbral adaptativo con "resaca" de silencio (*hangover*) de 600ms para no cortar pausas naturales de respiración.
   - Envío explícito de señal `clientContent.turnComplete = true` al detectar silencio sostenido.
2. **Arquitectura de 3 Watchdogs Escalonados:**
   - **Watchdog A (`TURN_ACK_TIMEOUT` - 8000ms):** Si tras enviar fin de turno el servidor no emite acuse de recibo (`serverAck`), se reinicia el stream de audio.
   - **Watchdog B (`MODEL_START_TIMEOUT` - 10000ms):** Si el servidor reconoce el turno pero el modelo no envía ningún chunk de texto/audio en 10s, se asume sesión colgada y se envía un ping de recuperación.
   - **Watchdog C (`MODEL_STALLED_TIMEOUT` - 6000ms):** Si el modelo empieza a responder pero se detiene en seco sin enviar `turnComplete`, el watchdog finaliza forzosamente el mensaje para desbloquear la interfaz.

---

### Ciclo 5: Claves de API Filtradas o Revocadas (Código 1008 de Google)
*Commits vinculados:* `1069646` (1 iteración con refactorización transversal)

#### Síntomas Observados
Cuando una API Key era accidentalmente subida a GitHub o reportada por el escáner de seguridad de Google, Google revocaba la clave inmediatamente. Sin embargo, en la aplicación:
* Electron y Android mostraban: *"Error: El modelo de IA no está disponible temporalmente. Intente más tarde."*
* El usuario quedaba confundido pensando que era una caída de los servidores de Google, cuando en realidad su clave había dejado de funcionar.

#### Causa Raíz Oculta
El WebSocket de Gemini Live se cerraba con código `1008 (Policy Violation)` y mensaje `API_KEY_INVALID / leaked key`. El capturador genérico de errores de la app interpretaba cualquier cierre anormal como un fallo de red o indisponibilidad del servicio (`MODEL_UNAVAILABLE`).

#### Solución Definitiva Implementada (`1069646`)
1. Creación del módulo centralizado `GeminiErrorMapper.ts` que parsea los códigos de cierre WebSocket (código 1008 y regex sobre payload `API key not valid / revoked`).
2. Mapeo al error de dominio `AUTH_INVALID` / `AUTH_LEAKED`.
3. Despliegue de un modal de advertencia crítica en rojo en Electron y una tarjeta de advertencia en Android con dos acciones directas:
   - Botón directo para abrir la ventana de Configuración y pegar una nueva clave.
   - Enlace directo a `https://aistudio.google.com/app/apikey` en el navegador predeterminado para generar un reemplazo inmediato.

---

### Ciclo 6: Empaquetado Windows y la Evolución del Sistema de Auto-Actualización
*Commits vinculados:* `ad2f32f` -> `a781863` (v0.1.2) -> `e12801f` (v0.1.3) (3 iteraciones)

#### Síntomas y Errores
1. **Error de Validación NuGet en Build (`a781863`):**
   Al intentar empaquetar con Squirrel.Windows, la compilación falló estrepitosamente con:
   `System.ComponentModel.DataAnnotations.ValidationException: Authors is required.`
   *Causa:* Squirrel genera un paquete NuGet `.nuspec` que exige obligatoriamente el campo `"author"` en `package.json`, el cual estaba ausente en el proyecto.
2. **Confusión por Archivos `.nupkg` y Duplicidad en Releases:**
   Squirrel.Windows generaba obligatoriamente un archivo `feynman-live-0.1.2-full.nupkg` de 126 MB y un archivo `RELEASES`. Esto confundía a los usuarios que intentaban descargar la aplicación, quienes no sabían si debían descargar el ejecutable o el archivo `.nupkg`.
3. **Limitación Inmutable de Versiones Portables:**
   El kernel de Windows bloquea en memoria cualquier `.exe` en ejecución. Una versión portable no puede sobrescribirse a sí misma en caliente sin un agente externo.

#### Solución Definitiva Implementada (`e12801f`)
1. **Descarte de Squirrel y Adopción de `electron-updater` con NSIS:**
   Se eliminó `update-electron-app` y el target `squirrel`. Se adoptó `electron-updater` con NSIS como estándar moderno.
2. **Releases Limpias:** En GitHub Releases ahora solo existen:
   - `Feynman-Live-Setup-X.X.X.exe` (Instalador NSIS que se auto-actualiza transparentemente).
   - `Feynman-Live-vX.X.X-windows-portable.exe` (Ejecutable portable independiente).
   - `latest.yml` y `.blockmap` (Metadatos de unos pocos bytes para descargas diferenciales).
   - **Cero archivos `.nupkg`.**
3. **Manejo Inteligente de Modo Portable:**
   Detección mediante `process.env.PORTABLE_EXECUTABLE_DIR`: la versión portable consulta GitHub Releases vía REST API y avisa de nuevas versiones sin intentar reemplazar el archivo bloqueado, preservando la estabilidad.

---

## 3. Matriz Comparativa: Error -> Causa Raíz -> Solución

| Componente | Error / Síntoma | Causa Raíz | Iteraciones Previas | Solución Definitiva |
|---|---|---|---|---|
| **Web Audio** | Stutter y tartamudeo en primer turno de voz | AudioContext suspendido y arranque en frío del hardware | 3 intentos (ampliar buffer, forzar resume reactivo) | `AudioPlaybackQueue.warmup()` al inicio de sesión + Jitter Buffer continuo |
| **Historial** | Audios no reproducían en `AudioPlayerBar` | Bloqueo por Content Security Policy (`blob:` no permitido) | 2 intentos (revisión de códec WAV, recarga de buffer) | Ajuste de CSP en `index.html` con `media-src blob: data:` y montaje DOM |
| **Gestión de Chat** | Mensaje fantasma de usuario al mandar texto | Buffer de micrófono acumulado no se vaciaba al escribir | 1 intento (búsqueda de renders duplicados en React) | Purgado atómico de buffers de audio al invocar `sendTextMessage()` |
| **Settings** | Cambio de modalidad (Audio/Texto) ignorado | Gemini Live solo negocia modalidades en setup inicial | 1 intento (actualizar estado local en React) | Reconexión forzada de WebSocket e inyección de directiva en systemInstruction |
| **WebSocket** | Sesiones Zombi (congelamiento de turnos) | Google no cerraba turnos por ruido ambiental de fondo | 2 intentos (timeouts globales arbitrarios de socket) | `LocalVoiceActivityDetector` (VAD) en cliente + 3 Watchdogs escalonados (A/B/C) |
| **Autenticación** | Clave revocada mostrada como "modelo no disponible" | Cierre WebSocket 1008 no mapeado a error de credenciales | 1 intento (reintentar conexión indefinidamente) | `GeminiErrorMapper` con detección de código 1008 y modal con acción directa a AI Studio |
| **Squirrel Build** | Fallo en compilación `Authors is required` | Manifiesto NuGet de Squirrel exige autor en `package.json` | 1 intento (intentos manuales de empaquetado) | Inyección de `"author"` en `package.json` y migración posterior a NSIS |
| **Auto-Update** | Paquete `.nupkg` visible y confuso para usuarios | Squirrel.Windows obliga a distribuir paquetes `.nupkg` | 1 versión publicada con Squirrel (v0.1.2) | Migración a `electron-updater` con NSIS (v0.1.3), eliminando `.nupkg` por completo |

---

## 4. Principios Preventivos y Reglas de Oro

Para garantizar que en el futuro ningún agente de IA o desarrollador reincida en estos fallos, se establecen las siguientes **Reglas de Oro del Proyecto Feynman Live**:

1. **Regla de Oro de Audio (Web Audio API):**
   * *Nunca* inicialices el `AudioContext` en respuesta a un evento asíncrono de red. Inicialízalo y despiértalo en el evento síncrono del clic de usuario (`warmup()`).
   * *Siempre* concatena audio PCM mediante una línea de tiempo continua basada en `audioContext.currentTime` y no mediante callbacks dispersos.

2. **Regla de Oro de Protocolos en Tiempo Real (Gemini Live):**
   * *Nunca* confíes en que un servidor remoto de IA enviará consistentemente las señales de cierre de turno. Todo cliente conversacional de voz debe tener **VAD local** y **Watchdogs con timeout** para recuperar el estado si el servidor enmudece.

3. **Regla de Oro de Gestión de Estados de Turno:**
   * Al conmutar entre canales de entrada (Voz vs Texto), purga de manera síncrona e irreversible los acumuladores de bytes del canal inactivo para prevenir mensajes fantasma.

4. **Regla de Oro de Autenticación y API Keys:**
   * Distingue con precisión quirúrgica entre un error de conexión transitorio (reintentable) y un error de violación de política (código 1008 / `API_KEY_INVALID`). Si la clave está revocada, aborta los reintentos y guía al usuario a renovar su credencial de inmediato.

5. **Regla de Oro de Distribución y Auto-Actualización:**
   * En proyectos basados en `electron-builder`, utiliza siempre **NSIS** junto con **`electron-updater`**.
   * Nunca utilices motores que obliguen a publicar archivos de empaquetado interno de máquina (como `.nupkg`) en los releases públicos; las releases deben contener únicamente instaladores limpios y binarios de uso directo.
