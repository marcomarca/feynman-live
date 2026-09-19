# Diagnóstico de causa raíz: cortes y lentitud del audio en Gemini Live

Fecha del análisis: 2026-09-14  
Alcance: diagnóstico y plan de acción; **no incluye implementación**.

## Conclusión ejecutiva

El problema no es un único «WebSocket lento». Hay dos fallos que producen síntomas parecidos y que los intentos anteriores han mezclado:

1. **Las pausas entre palabras se generan principalmente en la reproducción local.** `AudioPlaybackQueue` reproduce cada chunk PCM con un `AudioBufferSourceNode` independiente. El supuesto *jitter buffer* no almacena ni regula un flujo: cuando la cola se vacía o un chunk llega tarde, añade otra espera de 150 ms. Por tanto, una variación pequeña de red, IPC o del hilo de UI se amplifica y se convierte en un silencio audible.
2. **Los cortes abruptos de una respuesta son compatibles con falsas interrupciones de VAD.** El micrófono sigue abierto mientras habla Gemini. El audio del altavoz puede volver a entrar por el micrófono; Gemini usa por defecto `START_OF_ACTIVITY_INTERRUPTS`, así que ese eco puede cortar la respuesta. El filtro local basado en un único umbral RMS (`0.06`) no puede distinguir al usuario del eco y alterna entre suprimir voz real y dejar pasar eco fuerte.

Hay además tres amplificadores: procesamiento de captura en el hilo principal con una API obsoleta, actualizaciones React de volumen a alta frecuencia aunque el valor no se usa y trabajo síncrono de unión/WAV/Base64 dentro del callback que recibe el primer chunk del modelo.

La corrección debe separar explícitamente:

- transporte y formato del audio;
- continuidad de reproducción;
- detección de actividad e interrupciones;
- persistencia/UI fuera de la ruta crítica.

## Qué está confirmado y qué debe medirse

### Confirmado por el código

- El reproductor inserta 150 ms cada vez que `activeSources.size === 0` (`src/renderer/audio/playback.ts`, líneas 102–105).
- La versión confirmada en `HEAD` era aún peor: cuando quedaban menos de 10 ms programados, insertaba 100 ms aunque todavía no hubiera ocurrido un underrun. Esto fue introducido por `cf60f1e` y aumentado por `f02d322`.
- `activeSources` se usa a la vez como registro de nodos, indicador de reproducción, puerta del micrófono y detector de fin. Esas responsabilidades no representan el mismo estado.
- El micrófono transmite durante los estados `listening` **y** `speaking` (`StudySessionService.sendAudio`).
- Gemini interrumpe la generación al inicio de actividad si no se configura lo contrario; el SDK instalado (`@google/genai` 2.22.0) documenta ese comportamiento como predeterminado.
- El filtro de eco solo compara RMS con `0.06` (`src/renderer/audio/microphone.ts`, líneas 83–94). No usa duración, histéresis, referencia del audio de salida ni confirmación de voz.
- `_audioVolume` no se renderiza, pero `setAudioVolume` se ejecuta en cada frame del analizador y en cada chunk de salida (`src/renderer/App.tsx`, líneas 47, 58 y 225–227).
- Antes de reenviar el primer chunk del modelo, `StudySessionService` llama de forma síncrona a `flushUserAudioMessage()` (`src/services/StudySessionService.ts`, líneas 54–64). Esa función une todos los chunks acumulados, genera WAV/Base64 y notifica a la UI.
- No existen pruebas del planificador de reproducción ni de la interacción micrófono/VAD. Las pruebas actuales cubren conversión PCM, pero no continuidad temporal.

### Muy probable, pero requiere una traza en el equipo real

- Si en cada corte aparece `serverContent.interrupted`, el altavoz/ruido está provocando barge-in falso.
- Si no aparece `interrupted` y `queueAheadMs` llega a cero, el corte es un underrun local amplificado por la espera artificial.
- Pueden ocurrir ambos a la vez. Escuchar solamente el resultado no permite distinguirlos.

No se ejecutó una sesión real durante esta auditoría: hacerlo habría consumido API, requerido micrófono/altavoz y cambiado el estado externo. El plan empieza con instrumentación suficiente para cerrar esta última comprobación sin volver a adivinar.

## Flujo real de un chunk

```text
Micrófono
  -> ScriptProcessorNode (renderer/UI thread)
  -> resample + PCM16
  -> Electron IPC renderer -> main
  -> StudySessionService
  -> @google/genai Session.sendRealtimeInput
  -> WebSocket de Gemini

Gemini PCM16/24 kHz
  -> callback del SDK en Electron main
  -> StudySessionService (acumula/persiste/propaga)
  -> Electron IPC main -> renderer
  -> conversión PCM16 -> Float32
  -> un AudioBufferSourceNode por chunk
  -> altavoz
  -> posible retorno al micrófono
  -> VAD de Gemini
  -> serverContent.interrupted
  -> clear() de todos los nodos locales
```

El WebSocket es solo un tramo. La reproducción cruza dos procesos y termina en un planificador local dependiente del hilo de UI; por eso medir únicamente «conectado/no conectado» no descubre el fallo.

## Causa raíz 1: el jitter buffer añade los cortes que intenta evitar

### Comportamiento actual

`enqueuePcm16()` calcula:

```ts
if (this.activeSources.size === 0 || this.nextStartTime < currentTime) {
  startTime = this.activeSources.size === 0
    ? currentTime + this.leadTimeSeconds
    : currentTime;
} else {
  startTime = this.nextStartTime;
}
```

con `leadTimeSeconds = 0.15`.

Ejemplo con chunks de 100 ms:

| Evento | Tiempo | Resultado |
|---|---:|---|
| Llega A | 0 ms | Se programa para 150–250 ms |
| Llega B con solo 10 ms de jitter | 260 ms | A ya terminó y la cola figura vacía |
| Regla actual | 260 ms | B se programa para 410–510 ms |
| Silencio audible | 250–410 ms | **160 ms de corte producido localmente** |

Diez milisegundos de llegada tardía se convierten en 160 ms. Si esto pasa en límites de palabra o sílaba, el síntoma es exactamente «palabra, pausa, palabra, pausa».

La versión de `HEAD` (`283f856`) tenía esta regla:

```ts
if (this.nextStartTime < currentTime + 0.01) {
  startTime = currentTime + 0.1;
}
```

Eso podía insertar unos 100 ms incluso cuando el siguiente chunk llegaba **antes** de terminar el anterior. El cambio local mejora ese caso, pero conserva el reinicio de 150 ms cada vez que la cola alcanza cero. Aumentar de 60 a 100 y luego a 150 ms ha ocultado el underrun inicial a costa de hacer mucho más visibles los underruns posteriores.

### Por qué `warmup()` no lo resuelve

`warmup()` evita que el primer uso encuentre un `AudioContext` suspendido. Es correcto conservar esa preparación, pero solo reduce la latencia de arranque. No controla la cadencia de chunks, no mantiene una reserva de audio y no evita que el código vuelva a insertar 150 ms.

### Qué debe cambiar

Primero debe hacerse una comprobación A/B mínima: restaurar temporalmente el cursor continuo usado por el ejemplo oficial de Google:

```ts
startTime = Math.max(audioContext.currentTime, nextStartTime);
```

Sin `leadTimeSeconds`, sin reinicio a cero en `onended` y sin tratar cada vaciado como un «nuevo turno». Esto demuestra si desaparecen las pausas artificiales.

La solución estable recomendada es usar **un único `AudioWorkletNode` de salida con FIFO/ring buffer PCM**, no crear un nodo de reproducción por paquete de red. El worklet debe:

- recibir PCM convertido por `MessagePort`;
- acumular una reserva inicial pequeña y medida (por ejemplo 80–120 ms, no un retraso inventado por chunk);
- consumir muestras continuamente en el hilo de audio;
- contar underruns y, si ocurre uno, rebufferizar una sola vez hasta el umbral;
- vaciar la FIFO de inmediato ante una interrupción legítima;
- exponer por separado `bufferedMs`, `isAudible` e `isDrained`.

Es una primitiva nativa de Web Audio y coincide con el reproductor del ejemplo oficial de Gemini. El beneficio central no es «más abstracción», sino quitar la temporización de audio del hilo React.

## Causa raíz 2: el modelo puede oírse a sí mismo y abortar su respuesta

La configuración activa deja el VAD automático habilitado. Si no se indica `activityHandling`, el SDK define `START_OF_ACTIVITY_INTERRUPTS` como comportamiento predeterminado. Cuando el servidor cree que comenzó voz del usuario:

1. corta la generación;
2. envía `serverContent.interrupted`;
3. `GeminiLiveAdapter` lo propaga;
4. `StudySessionService` da el turno por interrumpido;
5. `App.tsx` ejecuta `playbackQueue.clear()`.

Ese es un corte real de conversación, diferente de un pequeño underrun.

El parche actual no es una solución de cancelación de eco:

```ts
if (options.isAiSpeaking?.()) {
  const rms = ...;
  if (rms < 0.06) return;
}
```

Problemas concretos:

- Un eco fuerte supera `0.06` y se transmite.
- Una voz humana suave no supera `0.06` y se pierde.
- `isAiSpeaking` significa realmente «hay algún source registrado», incluso si está programado para el futuro.
- En un underrun, la puerta cambia de estado siguiendo la cola defectuosa; el filtro de entrada hereda el error del reproductor.
- Descartar bloques completos crea una línea de tiempo de entrada discontinua.
- Subir el umbral de `0.045` a `0.06` solo desplaza el error según volumen, micrófono, distancia y dispositivo.

El `GainNode` con ganancia cero añadido al final del `ScriptProcessorNode` evita monitorizar la salida del propio procesador, pero ese procesador no escribía audio en su output. No cancela el sonido físico del altavoz que entra al micrófono y, por tanto, no resuelve el barge-in falso.

### Qué debe cambiar

Hay que decidir y probar un contrato de turno, no seguir ajustando un número RMS:

1. **Modo estable de referencia (half-duplex):** no enviar micrófono mientras el modelo está realmente audible. Permitir interrupción mediante una acción explícita. Este modo debe usarse para demostrar que los falsos `interrupted` desaparecen.
2. **Modo full-duplex:** verificar que la pista concedió realmente `echoCancellation` mediante `MediaStreamTrack.getSettings()`. Mantener VAD automático y retirar el gate RMS de un solo frame. Si el AEC del dispositivo no basta, usar VAD local con duración e histéresis y señales explícitas `activityStart`/`activityEnd`; no declarar actividad con una sola medición de energía.
3. Probar altavoces y auriculares. Si los cortes/interrupciones desaparecen con auriculares, la ruta de eco queda confirmada.

No se debe configurar `NO_INTERRUPTION` como arreglo silencioso salvo que el producto acepte perder barge-in. Evita el síntoma del servidor, pero cambia la interacción y puede hacer que el modelo hable encima del usuario.

## Amplificadores de latencia y jitter

### Captura en el hilo de UI

`ScriptProcessorNode` está obsoleto y ejecuta `onaudioprocess` en el hilo principal. Ese mismo hilo procesa React, scroll, IPC y programación de salida. Un pico de UI puede retrasar captura y reproducción simultáneamente. Debe sustituirse por `AudioWorkletNode` de captura.

El parámetro `chunkSizeMs` existe, pero no se usa. El tamaño real es 4096 muestras del dispositivo: unos 85 ms a 48 kHz y 93 ms a 44.1 kHz. Está dentro del máximo recomendado por Google, pero no representa el nombre de la opción y no permite ajustar ni verificar la cadencia. Google recomienda normalmente 20–40 ms para baja latencia y acepta hasta 100 ms.

El remuestreo también se reinicia en cada bloque y redondea la longitud por separado. Debe conservar fase/estado entre bloques o, si Chromium acepta el contexto solicitado, capturar directamente a 16 kHz y comprobar la frecuencia real. Esto afecta más a calidad/transcripción que a las pausas de salida.

### React trabaja a alta frecuencia sin beneficio

- El analizador llama `setAudioVolume` en cada `requestAnimationFrame`.
- Cada chunk de salida vuelve a llamar `setAudioVolume`.
- `_audioVolume` no se usa para renderizar nada.
- Cada delta de transcripción actualiza estado y dispara `scrollIntoView({ behavior: "smooth" })`.
- `useRef(new AudioPlaybackQueue(...))` y `useRef(new MicrophoneCapture())` evalúan constructores en cada render, aunque React solo conserve la primera instancia.

La acción mínima es eliminar por completo el estado/callback de volumen mientras no exista un visualizador. Si se reutiliza después, limitarlo a 8–10 Hz y aislar su componente. Agrupar los deltas de texto por frame o por intervalos cortos y no reiniciar un scroll suave por cada fragmento.

### Persistencia dentro del callback de audio

Al recibir el primer chunk de una respuesta, la aplicación primero vacía el turno del usuario. Ese vaciado:

- une todos los buffers acumulados desde el último turno;
- codifica WAV;
- convierte a Base64;
- crea y propaga un mensaje;
- inicia otra codificación/escritura en `ChatHistoryStore`.

Además, se acumula audio del micrófono incluso durante `speaking` cuando el gate deja pasar bloques. Esto aumenta memoria y trabajo sin representar necesariamente voz del usuario.

El primer chunk debe reenviarse al renderer antes de cualquier persistencia. La grabación del turno debe delimitarse por actividad real, y la unión/codificación debe ejecutarse fuera del callback de recepción. Para la UI, enviar metadatos y cargar el archivo de audio bajo demanda evita transportar grandes data URLs por IPC durante reproducción.

## Revisión de los intentos anteriores

| Intento | Evaluación | Por qué no resuelve la causa |
|---|---|---|
| Añadir `leadTimeSeconds` | Contraproducente tras un underrun | Convierte cada vaciado en 60/100/150 ms adicionales |
| `warmup()` del `AudioContext` | Válido pero parcial | Solo cubre suspensión/arranque del contexto |
| Aumentar captura de 2048 a 4096 | No relacionado con salida | Reduce cantidad de mensajes, pero aumenta latencia de entrada |
| Subir gate RMS 0.045 → 0.06 | Heurística frágil | No distingue eco de usuario y depende del hardware |
| Añadir `GainNode(0)` | Correcto como grafo mudo, no como AEC | No elimina el retorno físico altavoz → micrófono |
| `silenceDurationMs: 600` | Cambia fin de turno | Añade hasta 600 ms de espera de silencio; no suaviza salida |
| Cambiar `media`/`mediaChunks` por `audio` | Corrección válida del contrato | Afecta envío de entrada, no continuidad de reproducción |
| Soportar varios tipos en IPC | Defensivo pero no causal | El volumen de PCM es pequeño; no crea un buffer temporal |
| Fallback a `session.conn.send` | Debe eliminarse | Usa internals del SDK y duplica protocolos; `Session` 2.22.0 ya expone `sendRealtimeInput` |

## Contrato del SDK: qué conservar y qué limpiar

La modificación local que envía:

```ts
session.sendRealtimeInput({
  audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
});
```

coincide con el contrato instalado y con la documentación actual. Debe conservarse, pero con tipos oficiales en vez de `unknown` y `Record<string, unknown>`.

Cambios necesarios en `GeminiLiveAdapter`:

- tipar `session` como `Session` del SDK;
- tipar `liveConfig` como `LiveConnectConfig`;
- tipar los mensajes como `LiveServerMessage`;
- usar solamente métodos públicos (`sendRealtimeInput`, `sendClientContent`, `close`);
- eliminar accesos a `conn` y los mensajes JSON manuales;
- mantener el formato PCM16 mono little-endian: entrada 16 kHz, salida 24 kHz;
- no fijar `silenceDurationMs` sin que una medición justifique la compensación latencia/tolerancia a pausas.

Los casts amplios permitieron que un commit cambiara `audio` por una forma `media: [...]` sin que TypeScript protegiera el contrato.

## Plan de acción específico

### Fase 0 — Congelar el diagnóstico

- Conservar las cuatro modificaciones locales existentes; no sobrescribirlas sin decidir cuáles se aceptan.
- Registrar el commit base `283f856` y el estado de trabajo usado en cada prueba.
- No cambiar simultáneamente reproducción, VAD, payload e IPC. Cada experimento debe modificar una sola variable.

### Fase 1 — Añadir telemetría temporal mínima

Registrar por turno, sin guardar contenido de audio ni credenciales:

- instante y bytes de cada chunk recibido;
- duración PCM del chunk: `bytes / 2 / 24000`;
- `queueAheadMs = max(0, nextStartTime - audioContext.currentTime)`;
- número y duración total de underruns;
- tiempo WebSocket → IPC renderer → enqueue;
- tiempo de primer chunk y tiempo de primer sonido;
- cada `serverContent.interrupted`, junto con estado de reproducción y RMS de micrófono;
- `AudioContext.state`, frecuencia real y `MediaStreamTrack.getSettings()`.

Regla de clasificación:

```text
¿Hay serverContent.interrupted exactamente en el corte?
  sí -> investigar eco/VAD/turn-taking
  no  -> ¿queueAheadMs llegó a cero?
           sí -> reproducción/IPC/UI underrun
           no  -> formato PCM, dispositivo o suspensión de AudioContext
```

Esta fase debe producir una traza de al menos: primera respuesta, segunda respuesta, altavoces y auriculares.

### Fase 2 — Quitar la pausa artificial y validar

- Reemplazar la regla de `leadTimeSeconds` por el cursor continuo `max(now, nextStartTime)`.
- No poner `nextStartTime = 0` desde `onended`; actualizarlo solo en `clear/close` o al comenzar una nueva generación explícita.
- Separar `isPlaying` de `activeSources.size`.
- Añadir una prueba con reloj falso: chunks de 100 ms que llegan a 0, 95, 205 y 300 ms no deben adquirir pausas extra de 100/150 ms.
- Comparar traza antes/después. Si desaparecen los cortes y no hay underruns relevantes, detenerse aquí: no añadir más infraestructura.

### Fase 3 — Hacer la reproducción robusta solo si la Fase 2 aún muestra underruns

- Sustituir los múltiples `AudioBufferSourceNode` por un `AudioWorkletNode` continuo con FIFO PCM.
- Iniciar una vez al alcanzar el umbral medido.
- Tras un underrun, rebufferizar una vez; no insertar lead-time por chunk.
- Implementar `clear()` como vaciado atómico con identificador de generación para ignorar chunks antiguos.
- Mantener métricas de buffer y underrun accesibles a pruebas, no a React en cada frame.

### Fase 4 — Aislar y resolver las interrupciones falsas

- Ejecutar primero el modo half-duplex de referencia. Si `interrupted` desaparece, queda probado el retorno de audio/VAD.
- Confirmar `echoCancellation` real en la pista; solicitar mono y una frecuencia ideal coherente.
- Retirar el gate RMS actual.
- Para full-duplex, validar AEC con altavoces y auriculares. Si aún hay falsos positivos, implementar VAD local con histéresis/duración y actividad manual de Gemini.
- Verificar que voz real interrumpe en el objetivo definido, pero ruido/voz del modelo no.

### Fase 5 — Sacar UI y persistencia de la ruta crítica

- Eliminar `_audioVolume` y sus callbacks mientras no se visualice.
- Agrupar transcripción y scroll; evitar animación suave por delta.
- Reenviar el primer chunk antes de vaciar/persistir el turno del usuario.
- Acumular solo audio perteneciente a actividad de usuario confirmada.
- Mover WAV/Base64/escritura fuera del callback de recepción.
- Evitar mandar audio Base64 completo en el evento de mensaje; cargarlo bajo demanda desde persistencia.

### Fase 6 — Cerrar contratos y borrar parches muertos

- Aplicar tipos públicos del SDK de extremo a extremo.
- Conservar `sendRealtimeInput({ audio: ... })`.
- Eliminar fallback de `conn`, formas duplicadas `mediaChunks` y ramas defensivas que no puedan ocurrir con el contrato IPC establecido.
- Usar un único tipo serializable para audio en cada dirección IPC y comprobar `byteLength`/paridad en los límites.

### Fase 7 — Criterios de aceptación

La reparación no se considera terminada hasta cumplir:

- cero pausas artificiales añadidas por el planificador;
- ningún `serverContent.interrupted` mientras el usuario permanece en silencio durante diez respuestas con el dispositivo objetivo;
- primera y siguientes respuestas con la misma continuidad, separando TTFB del servidor de latencia local;
- reproducción cuya duración coincide con `totalBytes / 2 / 24000` dentro de una tolerancia pequeña;
- interrupción real vacía audio pendiente inmediatamente;
- después de detener sesión no quedan micrófono, worklets, temporizadores ni contextos activos;
- prueba prolongada sin crecimiento continuo de buffers de usuario/modelo;
- verificación en altavoces y auriculares.

## Archivos afectados por la reparación futura

Prioridad alta:

- `src/renderer/audio/playback.ts`: reemplazar el planificador defectuoso y separar estados.
- `src/renderer/audio/microphone.ts`: retirar gate RMS y migrar captura fuera del hilo UI.
- `src/renderer/App.tsx`: eliminar actualizaciones de alta frecuencia, desacoplar estados y manejar interrupción explícita.
- `src/services/StudySessionService.ts`: sacar persistencia del callback y delimitar audio por turnos reales.
- `src/adapters/gemini/GeminiLiveAdapter.ts`: tipar SDK y definir contrato VAD.

Prioridad media:

- `src/preload/preload.ts`, `src/main/ipc-handlers.ts`, `src/shared/ipc-contract.ts`: unificar representación IPC y añadir métricas temporales de diagnóstico.
- pruebas nuevas para reproducción temporal y turn-taking.

No es necesario cambiar `pcm16ToFloat32` para explicar los cortes actuales. Su manejo little-endian y del byte impar es razonable.

## Referencias técnicas

- [Gemini Live API: capacidades y VAD](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Gemini Live API: prácticas recomendadas de streaming](https://ai.google.dev/gemini-api/docs/live-api/best-practices)
- [Contrato `LiveSendRealtimeInputParameters` del SDK JS](https://googleapis.github.io/js-genai/release_docs/interfaces/types.LiveSendRealtimeInputParameters.html)
- [Ejemplo oficial de reproducción/captura con AudioWorklet](https://github.com/google-gemini/gemini-live-api-examples/blob/main/gemini-live-ephemeral-tokens-websocket/frontend/mediaUtils.js)
- [Ejemplo oficial con cursor continuo `nextStartTime`](https://github.com/google-gemini/gemini-live-api-examples/blob/main/gemini-live-genai-python-sdk/frontend/media-handler.js)
- [MDN: `ScriptProcessorNode` está obsoleto y fue reemplazado por AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode/audioprocess_event)

## Diagnóstico final

La raíz audible es un **planificador de playback que amplifica el jitter en lugar de absorberlo**. La raíz de los abortos conversacionales es un **contrato full-duplex/VAD no resuelto**, parcheado con un umbral de volumen que no representa identidad de hablante ni eco. Los cambios de payload, tamaño de chunk, warmup y silencio del VAD pueden ser válidos en su propio ámbito, pero no arreglan esas dos causas.

El orden correcto es: medir corte → quitar silencio artificial → confirmar interrupciones → resolver turn-taking → sacar trabajo no esencial de la ruta crítica. Cambiar todo a la vez volvería a ocultar el origen.
