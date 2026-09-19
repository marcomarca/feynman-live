# feynman-live

Feynman Live es una plataforma de aprendizaje socrático interactivo potenciada por Google Gemini Live, con clientes nativos para **Escritorio (Electron / React)** y **Móvil (Android / Jetpack Compose)**.

## Características Principales

- **Conversación en Vivo por Voz**: Streaming bidireccional de baja latencia con Gemini Live (`audio/pcm;rate=16000` entrada, `audio/pcm;rate=24000` salida).
- **Detección de Actividad de Voz (VAD)**: Filtrado adaptativo de ruido de fondo, umbrales de histéresis y resaca de silencio configurable.
- **Watchdogs y Recuperación de Sesiones**: Supervisión en tres etapas (`TURN_ACK_TIMEOUT`, `MODEL_START_TIMEOUT`, `MODEL_STALLED_TIMEOUT`) para evitar sesiones congeladas y retransmisión automática de audio no reconocido.
- **Aislamiento Estricto por Chat**: Cada conversación almacena de forma independiente su propio prompt tutor, material de estudio de referencia e historial.
- **Seguridad y Cifrado de Credenciales**:
  - **Escritorio**: Cifrado local con **Windows DPAPI** (`safeStorage`) en `%APPDATA%\feynman-live\secrets\gemini_api_key.bin`.
  - **Android**: Cifrado por hardware en **Android Keystore (TEE / StrongBox)** con `AES-256 GCM` en almacenamiento privado de la app (`MODE_PRIVATE`).

## Estructura del Proyecto

```
feynman-live/
├── src/            # Aplicación de escritorio (Electron, TypeScript, React)
├── tests/          # Suite de pruebas unitarias y de integración de escritorio
├── android/        # Aplicación nativa Android (Kotlin, Jetpack Compose, Material 3)
│   └── app/build/outputs/apk/debug/app-debug.apk
└── docs/           # Planes de arquitectura y migración
```

## Ejecución

### Escritorio
```bash
bun install
bun start
```

### Android
```bash
cd android
./gradlew assembleDebug
```
