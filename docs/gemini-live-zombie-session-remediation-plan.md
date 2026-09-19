# Plan de remediación: sesiones «zombi» y turnos de voz sin respuesta en Gemini Live

Fecha del diagnóstico: 2026-09-18  
Alcance de este documento: diagnóstico y especificación para una implementación posterior.  
Estado: **no implementado**.

## Mandato para la inteligencia artificial implementadora

Este archivo describe qué debe corregirse y cómo comprobarlo. La IA que reciba este plan debe implementar la solución, pero antes debe:

1. Leer `AGENTS.md`, este documento completo y `docs/audio-streaming-root-cause-analysis.md`.
2. Ejecutar `git status --short` y revisar el diff existente. Al redactar este plan ya había cambios sin confirmar en los mismos archivos del flujo de audio; deben preservarse y no sobrescribirse.
3. No volver a introducir `mediaChunks` ni accesos privados como `session.conn`.
4. Hacer el cambio por fases y comprobar cada hipótesis con métricas. No mezclar en un único parche la recuperación de sesiones, la reproducción y una reescritura completa del audio.
5. Si inicia frontend, backend, Vite, Electron o cualquier proceso de prueba persistente, cerrarlo al finalizar. No dejar procesos abiertos.

## Resumen ejecutivo

El texto `Transmitidos 900/1100 chunks de audio a Gemini` no significa que Gemini esté buscando chunks ni confirma que Google haya procesado esos datos. El contador aumenta inmediatamente después de llamar de forma síncrona a `session.sendRealtimeInput`; es solamente un contador local de intentos de envío.

El defecto principal es de **liveness y delimitación de turnos**:

- La aplicación mantiene `connected = true` mientras el WebSocket no emita `error` o `close`.
- No existe un fin explícito del flujo de audio después de que el usuario termina de hablar.
- No existe un timeout entre «el usuario terminó» y «el servidor reconoció el turno».
- No existe un timeout entre «el servidor transcribió al usuario» y «el modelo comenzó a responder».
- La recuperación solo se activa ante errores o cierres del socket. Una conexión abierta pero improductiva puede permanecer indefinidamente.
- Mientras tanto, el micrófono sigue enviando PCM y `currentUserAudioChunks` sigue creciendo.

Los logs demuestran dos clases distintas de bloqueo:

1. **Audio sin reconocimiento remoto:** después de `setupComplete`, el cliente envía más de mil chunks, pero no recibe transcripción, audio del modelo, `turnComplete` ni error.
2. **Turno reconocido sin generación:** el servidor entrega la transcripción final del usuario, pero el modelo nunca inicia la respuesta y el socket permanece abierto.

Una solución robusta debe detectar y recuperar ambos estados. Cambiar exclusivamente el formato del payload no los resuelve.

## Evidencia concreta

Log analizado:

```text
C:\Users\Rescate\AppData\Roaming\Feynman Live\app-data\logs\session.log
```

### Caso A: sesión abierta que nunca reconoce voz

Secuencia del 2026-09-19:

```text
01:13:09.599  setupComplete
01:13:09.646  comienza envío de audio PCM 16 kHz
01:13:18.098  100 chunks
...
01:15:18.728  1100 chunks
01:15:30.317  cierre solicitado por el usuario
```

Durante unos 141 segundos no apareció:

- `inputTranscription`;
- primer chunk del modelo;
- texto del modelo;
- `turnComplete`;
- `interrupted`;
- error del WebSocket.

El socket parecía abierto, pero no existía ninguna prueba de progreso remoto.

### Caso B: el servidor transcribe, pero no genera respuesta

Secuencia del 2026-09-15:

```text
03:40:35.488  setupComplete
03:40:51.857  Transcripción del usuario: "Continúa preguntándome."
03:40:52.531  200 chunks
...
03:41:41.871  700 chunks
03:41:45.023  cierre solicitado por el usuario
```

Aquí el formato, la captura, el transporte y el VAD funcionaron al menos hasta producir una transcripción final. La generación del modelo fue la etapa que quedó bloqueada.

### El mismo código también funciona

Antes del último bloqueo, la misma versión completó sesiones con múltiples turnos. Por ejemplo, entre 01:06:46 y 01:13:07 se observaron 11 transcripciones del usuario y 11 turnos completos del modelo.

Por tanto, el fallo no es un error determinista de conversión PCM, MIME o serialización. Es intermitente y el diseño actual no contiene el fallo cuando ocurre.

### `mediaChunks` está descartado

El servidor respondió varias veces:

```text
WebSocket 1007: realtime_input.media_chunks is deprecated.
Use audio, video, or text instead.
```

La forma que debe conservarse es:

```ts
session.sendRealtimeInput({
  audio: {
    mimeType: "audio/pcm;rate=16000",
    data: base64Data,
  },
});
```

El SDK instalado, `@google/genai` 2.22.0, declara `audio`, `audioStreamEnd`, `activityStart` y `activityEnd` en `LiveSendRealtimeInputParameters` y serializa `audio` a `realtimeInput.audio`.

## Causas descartadas o secundarias

### No cambiar `audio` por `media`

`media/mediaChunks` fue rechazado explícitamente por el backend. El diagnóstico previo que proponía ese cambio era incorrecto para el modelo y endpoint observados.

### No eliminar `realtimeInputConfig` por considerarlo inválido

`automaticActivityDetection` y `silenceDurationMs` son campos públicos del SDK y de la Live API. El valor actual de 600 ms está dentro del intervalo recomendado de 500 a 800 ms.

### La construcción de `Buffer` no está desalineando el audio

Esta forma respeta correctamente la vista original:

```ts
Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
```

Cambiarla por `Buffer.from(chunk)` puede simplificar el código, pero no explica el bloqueo.

### El número de chunks no es una condición de error

El contador es acumulativo durante toda la conexión. Una sesión sana también puede superar mil chunks. Debe dejar de usarse como indicador de espera o salud.

### El playback no explica la ausencia de transcripción

Los defectos descritos en `docs/audio-streaming-root-cause-analysis.md` pueden producir pausas o cortes audibles, pero no explican una sesión que no recibe ningún evento del servidor. No mezclar ambos arreglos hasta cerrar primero el problema de liveness.

### El historial no parece ser la causa inmediata

Los historiales inspeccionados no estaban cerca del límite de contexto del modelo y `setupComplete` se recibió correctamente. Aun así, la gestión de contexto debe fortalecerse para sesiones largas.

## Objetivo funcional

Después de que el usuario termine una frase, la aplicación debe lograr uno de estos resultados en un tiempo acotado:

1. Gemini reconoce el turno y responde.
2. La sesión se declara improductiva, se reconecta automáticamente y se reintenta de manera controlada.
3. Tras agotar los reintentos, se muestra un error claro y recuperable.

Nunca debe permanecer durante minutos incrementando un contador sin saber si el micrófono, el servidor o la generación están progresando.

## Diseño propuesto

## 1. Contrato explícito de eventos del proveedor

Extender `LiveTutorProvider` para expresar eventos de protocolo y no inferir toda la salud a partir de audio de salida.

Como mínimo, el servicio necesita recibir:

- actividad o transcripción del usuario;
- inicio de salida del modelo;
- `generationComplete`;
- `turnComplete` y `turnCompleteReason`;
- `waitingForInput` cuando exista;
- `goAway`;
- `sessionResumptionUpdate`;
- cierre y error.

Añadir una operación pública equivalente a:

```ts
endAudioStream(): void;
```

Su única implementación Gemini debe ejecutar:

```ts
session.sendRealtimeInput({ audioStreamEnd: true });
```

No exponer `session.conn`, no escribir JSON del protocolo manualmente y no depender de miembros privados del SDK.

Archivos principales:

- `src/adapters/gemini/GeminiLiveAdapter.ts`
- `src/services/StudySessionService.ts`

## 2. VAD híbrido y finalización explícita del turno

Conservar el VAD automático del servidor. Añadir detección local únicamente para saber cuándo finalizar el flujo actual.

Flujo:

```text
PCM local continuo
  -> se detecta inicio de voz local
  -> se siguen enviando chunks con { audio }
  -> se detectan 600–800 ms de silencio después de voz válida
  -> se envía una vez { audioStreamEnd: true }
  -> comienza el watchdog de reconocimiento remoto
```

Requisitos del detector local:

- Calcular RMS y pico sobre las muestras antes de convertirlas a PCM16.
- Mantener un piso de ruido adaptativo.
- Usar umbrales diferentes para entrar y salir de voz, evitando oscilación.
- Exigir una duración mínima de voz antes de abrir un turno; un pico aislado no cuenta.
- Usar al menos 600 ms de silencio para cerrar, evitando cortar pausas naturales.
- No dejar de enviar el principio de una frase: el servidor sigue siendo responsable de detectar el inicio y conservar su prefix padding.
- Emitir `speechStart` y `speechEnd` como eventos semánticos, no como actualizaciones React por frame.
- Enviar `audioStreamEnd` también al mutear, detener la captura, perder el dispositivo o pausar el flujo durante más de un segundo.

La detección local no debe reemplazar inicialmente al VAD de Gemini. Deshabilitar por completo el VAD remoto obligaría a gestionar `activityStart/activityEnd`, pre-roll y todos los falsos positivos; no es necesario para corregir este incidente.

Archivo principal:

- `src/renderer/audio/microphone.ts`

La señal `speechEnd` debe atravesar el contrato IPC hasta `StudySessionService`/`GeminiLiveAdapter`. Definir un único canal semántico; no inferir el final contando chunks.

Archivos de frontera:

- `src/shared/ipc-contract.ts`
- `src/preload/preload.ts`
- `src/main/ipc-handlers.ts`
- `src/renderer/App.tsx`

## 3. Máquina de estados por turno

No utilizar únicamente `listening` y `speaking`. Mantener internamente un estado de protocolo por turno, aunque la UI siga mostrando estados simplificados.

Estados mínimos:

```text
idle
connecting
listening
user-speaking
awaiting-server-ack
awaiting-model-output
model-speaking
reconnecting
error
stopping
```

Cada turno debe poseer:

```ts
interface VoiceTurnRuntime {
  turnId: number;
  connectionGeneration: number;
  speechStartedAt: number;
  speechEndedAt?: number;
  audioStreamEndedAt?: number;
  firstServerAckAt?: number;
  finalTranscriptAt?: number;
  firstModelOutputAt?: number;
  lastServerEventAt?: number;
  retryCount: number;
  serverAcknowledgedInput: boolean;
}
```

`connectionGeneration` debe incrementarse al conectar. Todo callback capturado por una generación anterior debe ignorarse después de reconectar. Esto impide que eventos tardíos completen o corrompan el turno nuevo.

Las transiciones deben estar centralizadas en `StudySessionService`; no distribuir timeouts entre renderer, adapter y servicio.

## 4. Watchdogs por etapa

Crear temporizadores solamente después de actividad semántica, no por mantener un micrófono abierto.

### Watchdog A: reconocimiento del turno

Inicio: inmediatamente después de `audioStreamEnd`.  
Éxito: llega `interimInputTranscription`, `inputTranscription`, actividad remota o salida del modelo.  
Timeout inicial recomendado: 5 segundos.

Si vence:

1. registrar `TURN_ACK_TIMEOUT` con métricas locales;
2. detener el envío a la conexión vieja;
3. cerrar/reconectar;
4. reintentar una vez el audio acotado del turno, seguido de `audioStreamEnd`.

El audio solo puede repetirse si no hubo ninguna confirmación remota. Si ya llegó transcripción, repetirlo podría duplicar el mensaje.

### Watchdog B: inicio de generación

Inicio: al recibir la transcripción final del usuario o una confirmación equivalente de turno.  
Éxito: llega audio, texto, estado de generación o `waitingForInput`.  
Timeout inicial recomendado: 10 segundos.

Si vence:

1. registrar `MODEL_START_TIMEOUT`;
2. no reenviar el audio ya reconocido;
3. reconectar preservando contexto;
4. informar en UI que la sesión fue recuperada y solicitar repetir solo si el protocolo no permite continuar el turno reconocido.

### Watchdog C: generación detenida

Inicio: con el primer contenido del modelo.  
Se renueva: con cada evento útil del servidor.  
Éxito: `generationComplete`, `turnComplete` o `waitingForInput`.  
Timeout inicial recomendado: 15 segundos sin ningún evento.

Si vence, cerrar la salida incompleta, limpiar playback y reconectar. No concatenar posteriormente contenido tardío de la sesión anterior.

### Política de reintentos

- Máximo de tres reconexiones con backoff.
- Reiniciar el contador después de un turno completo, no inmediatamente después de `setupComplete`.
- Una reconexión que obtiene `setupComplete` pero vuelve a quedar zombi no cuenta como recuperación exitosa.
- Nunca crear dos temporizadores de recuperación simultáneos.
- Cancelar todos los watchdogs al detener, mutear, completar o interrumpir el turno.

La implementación actual reinicia `reconnectAttempt` apenas `connect()` termina; esto permite ciclos de sesiones que conectan pero no sirven. Debe cambiarse para considerar éxito solo después de progreso remoto real.

## 5. Buffer de reintento y límite de memoria

`currentUserAudioChunks` no debe contener todo el audio ambiental de la sesión.

Cambiarlo por un buffer asociado al turno activo:

- comenzar a conservar audio alrededor de `speechStart`;
- mantener como máximo 30 segundos de PCM16 por turno;
- descartar silencio posterior a `speechEnd`;
- borrar al completar, interrumpir, cancelar o agotar reintentos;
- no crear WAV/Base64 en la ruta crítica del primer chunk de respuesta;
- no conservar indefinidamente audio sin transcripción.

Para 16 kHz, mono, PCM16:

```text
32 000 bytes/segundo
30 segundos = 960 000 bytes aproximadamente
```

Un límite por bytes es más fiable que uno por número de chunks.

El buffer de reintento debe ser distinto del audio histórico que se persiste en el chat. La recuperación no debe depender de que la escritura a disco haya terminado.

## 6. Telemetría necesaria

El siguiente incidente debe poder clasificarse sin escuchar el audio ni registrar contenido sensible.

Por turno registrar:

- `turnId` y `connectionGeneration`;
- frecuencia real del `AudioContext`;
- tamaño medio y frecuencia de chunks;
- bytes y milisegundos estimados enviados;
- RMS, pico y porcentaje de muestras no cero agregados;
- `MediaStreamTrack.readyState`, `muted` y `enabled`;
- `speechStart`, `speechEnd` y `audioStreamEnd`;
- tipo de cada evento del servidor y tiempo desde el evento anterior;
- transiciones de estado y motivo de cada timeout;
- tiempo desde fin de voz hasta transcripción;
- tiempo desde transcripción hasta primer output;
- tiempo total hasta `turnComplete`;
- número de reconexiones y si se usó resumption.

No registrar:

- API key ni siquiera parcialmente;
- PCM o Base64 en logs;
- texto completo del material de estudio;
- transcripciones completas en producción, salvo que exista una opción explícita de diagnóstico.

Renombrar el mensaje actual:

```text
Transmitidos N chunks de audio a Gemini
```

por algo que no simule confirmación remota, por ejemplo:

```text
Encolados N chunks de audio en la sesión local
```

## 7. Gestión robusta de sesión Gemini

Añadir al setup:

```ts
contextWindowCompression: { slidingWindow: {} },
sessionResumption: {},
```

Procesar y conservar el último handle válido recibido en `sessionResumptionUpdate`.

Procesar `goAway` antes del cierre:

1. impedir que se abra un turno nuevo en la conexión que va a expirar;
2. terminar o acotar el turno actual;
3. abrir la siguiente conexión con el handle de resumption;
4. intercambiar conexiones mediante `connectionGeneration`;
5. cerrar la vieja después de que la nueva esté operativa.

No esperar a que la conexión muera para renovar. La documentación oficial indica que las conexiones Live tienen vida limitada y pueden ser reemplazadas periódicamente.

## 8. Migración de modelo

`gemini-3.1-flash-live-preview` está clasificado actualmente como preview heredado. Google recomienda Gemini 3.8 Live para la mayoría de experiencias de voz de baja latencia.

La migración debe hacerse después de incorporar telemetría y watchdogs, mediante una prueba A/B:

1. Ejecutar el mismo audio pregrabado y la misma secuencia de turnos contra 3.1 y 3.8.
2. Comparar reconocimiento, latencia, bloqueos y cierres.
3. Revisar las diferencias de configuración; no copiar ciegamente `thinkingLevel` entre modelos.
4. Cambiar el modelo predeterminado solo cuando las pruebas confirmen compatibilidad de voz, transcripción e historial.

Migrar de modelo reduce el riesgo de backend, pero no elimina la obligación de manejar sesiones zombis. Una aplicación robusta debe recuperarse aunque el proveedor falle temporalmente.

## Orden de implementación recomendado

### Fase 1: observabilidad mínima

1. Añadir identificador de conexión y turno.
2. Añadir métricas locales agregadas de captura.
3. Registrar tipos de eventos del servidor.
4. Eliminar el fragmento de API key de los logs.
5. Reproducir el fallo y clasificarlo como captura, ack o generación.

Resultado esperado: saber en una sola traza qué etapa dejó de avanzar.

### Fase 2: fin explícito de turno

1. Añadir `speechStart/speechEnd` local.
2. Añadir el canal IPC correspondiente.
3. Añadir `LiveTutorProvider.endAudioStream()`.
4. Enviar `audioStreamEnd` una sola vez por turno.
5. Cubrir mute, stop y pérdida del dispositivo.

Resultado esperado: el usuario deja de depender únicamente del silencio interpretado por el VAD remoto.

### Fase 3: máquina de estados y watchdogs

1. Centralizar las transiciones en `StudySessionService`.
2. Implementar los tres timeouts.
3. Añadir `connectionGeneration` para eventos tardíos.
4. Corregir el criterio que reinicia `reconnectAttempt`.
5. Añadir buffer acotado y reintento sin duplicación.

Resultado esperado: ninguna sesión improductiva puede continuar indefinidamente.

### Fase 4: resumption y vida larga

1. Manejar `sessionResumptionUpdate`.
2. Manejar `goAway`.
3. Activar compresión de contexto.
4. Verificar renovación de conexión en conversaciones largas.

### Fase 5: A/B de modelo

1. Probar 3.1 contra 3.8.
2. Adoptar 3.8 si cumple todos los criterios.
3. Mantener el watchdog independientemente del modelo elegido.

### Fase 6: mejoras de captura solo si las métricas lo justifican

La captura actual usa `ScriptProcessorNode`, que está obsoleto y trabaja en el hilo principal. Migrar a `AudioWorkletNode` y chunks de 20–40 ms es recomendable, pero no debe mezclarse con la primera corrección salvo que las métricas demuestren pérdida o silencios locales.

## Pruebas requeridas

## Pruebas unitarias del adapter

1. `sendAudio` produce `realtimeInput.audio`, nunca `mediaChunks`.
2. `endAudioStream` produce exactamente `{ audioStreamEnd: true }`.
3. `generationComplete`, `turnComplete`, `waitingForInput`, `goAway` y resumption se propagan.
4. Un callback de una generación vieja se ignora tras reconectar.
5. No se imprime ninguna parte de la API key.

## Pruebas unitarias del detector de voz

1. Silencio puro no abre turno.
2. Un pico corto no abre turno.
3. Voz sostenida abre una sola vez.
4. Pausa menor a 600 ms no cierra.
5. Silencio suficiente cierra una sola vez.
6. Ruido de fondo estable ajusta el piso sin considerarse voz.
7. Stop/mute emite fin de flujo cuando corresponde.

## Pruebas de `StudySessionService`

Usar proveedor falso y reloj falso.

1. `speechEnd` sin eventos remotos vence en 5 s y reconecta.
2. Transcripción final sin salida vence en 10 s y reconecta sin repetir audio.
3. Salida iniciada que se congela vence en 15 s.
4. Un turno normal cancela todos los timeouts.
5. Una interrupción cancela timeouts y limpia audio pendiente.
6. Dos errores simultáneos no crean dos reconexiones.
7. Una conexión con `setupComplete` pero sin progreso no reinicia el presupuesto de reintentos.
8. Después de tres fallos se publica un error recuperable.
9. Audio no confirmado se repite como máximo una vez.
10. Audio confirmado nunca se repite.
11. El buffer no supera el máximo por bytes.
12. Eventos tardíos de la conexión anterior no alteran el turno actual.

## Prueba de integración sin micrófono

Usar un PCM16 conocido y pregrabado para eliminar variabilidad del dispositivo:

1. Conectar.
2. Enviar audio en chunks con temporización realista.
3. Enviar `audioStreamEnd`.
4. Esperar transcripción y respuesta.
5. Repetir al menos 20 conexiones y 100 turnos.
6. Registrar distribución de latencias y cualquier recuperación.

No incluir esta prueba Live en el conjunto unitario predeterminado si consume API. Debe activarse explícitamente mediante variable de entorno.

## Prueba manual con dispositivo real

Casos:

- altavoces;
- auriculares;
- silencio prolongado;
- ruido constante;
- frase corta;
- frase con pausas naturales;
- mute/unmute;
- detener y reiniciar sesión;
- ocultar/restaurar ventana;
- desconectar/reconectar micrófono;
- pérdida temporal de red;
- conversación superior a 15 minutos.

Cerrar Electron, Vite y cualquier proceso auxiliar después de la prueba.

## Criterios de aceptación

La solución no se considera terminada hasta que cumpla todo lo siguiente:

- Ningún turno puede quedar más de 10 segundos sin respuesta ni transición visible a recuperación.
- `audioStreamEnd` se envía exactamente una vez por turno de voz válido.
- Una sesión que no reconoce audio se reinicia automáticamente.
- Una sesión que transcribe pero no genera también se reinicia automáticamente.
- No hay duplicación de turnos ya reconocidos.
- Los eventos de conexiones anteriores no contaminan la conexión nueva.
- El buffer de voz permanece por debajo del límite configurado.
- No se registra ninguna parte de la API key.
- Veinte conexiones consecutivas y cien turnos no producen espera infinita.
- La renovación de conexión conserva continuidad en una sesión larga.
- Después de stop no quedan micrófono, AudioContext, worklet/processor, watchdogs, timeouts ni sockets activos.
- Todos los procesos levantados para pruebas quedan cerrados.

## Archivos probablemente afectados

Prioridad alta:

- `src/adapters/gemini/GeminiLiveAdapter.ts`
- `src/services/StudySessionService.ts`
- `src/renderer/audio/microphone.ts`
- `src/shared/ipc-contract.ts`
- `src/preload/preload.ts`
- `src/main/ipc-handlers.ts`
- `src/renderer/App.tsx`

Pruebas:

- `tests/integration/study-session-service.test.ts`
- un nuevo test unitario del adapter Live;
- un nuevo test unitario de VAD/turn detection;
- una prueba Live opt-in con PCM pregrabado.

Prioridad posterior:

- `src/renderer/audio/playback.ts`, solo para los problemas de cortes/underrun ya documentados por separado;
- configuración y constantes del modelo para la migración A/B.

## Referencias oficiales

- Gemini Live API, capacidades y VAD: <https://ai.google.dev/gemini-api/docs/live-api/capabilities>
- Gemini Live API, prácticas recomendadas: <https://ai.google.dev/gemini-api/docs/live-api/best-practices>
- Gestión de sesiones, resumption y GoAway: <https://ai.google.dev/gemini-api/docs/live-api/session-management>
- Modelo Gemini 3.1 Flash Live Preview: <https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview>
- SDK oficial JavaScript: <https://github.com/googleapis/js-genai>

## Conclusión final

El fallo no es que Gemini necesite recibir más chunks. El programa carece de una noción comprobable de progreso remoto. Confunde «el método local no lanzó una excepción» con «la sesión está viva» y, cuando el proveedor no reconoce o no genera un turno, no tiene ninguna transición que termine la espera.

La reparación central es:

```text
fin de voz local
  -> audioStreamEnd
  -> watchdog de reconocimiento
  -> watchdog de generación
  -> reconexión/resumption acotada
  -> error visible si se agotan los intentos
```

El payload debe continuar usando `audio`. El límite de memoria, la telemetría, la renovación de sesiones y la migración a Gemini 3.8 completan la robustez, pero no sustituyen esa máquina de estados.
