# Arquitectura de Feynman Live

## Principios de Diseño
1. **Local-First & Offline-Capable Fallback:** La generación del prompt portable y la persistencia no dependen de conexión a red ni de credenciales.
2. **Separación Estricta de Capas:**
   - `domain/`: Lógica de dominio pura (sin dependencias de frameworks ni UI).
   - `services/`: Orquestación y casos de uso.
   - `adapters/`: Implementación de integraciones externas (Gemini Live SDK, filesystem, safeStorage, clipboard).
   - `shared/`: Contratos e interfaces tipadas para IPC.
   - `main/`: Proceso Node/Electron (seguridad, lifecycle, IPC handlers, tray, hotkeys).
   - `preload/`: ContextBridge estrecho (`feynmanDesktopApi`).
   - `renderer/`: UI React + WebAudio (sin acceso directo a APIs de Node o secretos).

## Diagrama de Comunicación
```text
┌────────────────────────────┐
│      Renderer (React)      │
│  UI + WebAudio (AudioIn/Out│
└─────────────┬──────────────┘
              │ window.feynmanDesktopApi (narrow typed contextBridge)
┌─────────────▼──────────────┐
│          Preload           │
└─────────────┬──────────────┘
              │ IPC (invoke / send / on)
┌─────────────▼──────────────┐
│       Electron Main        │
│ StudySessionService        │
│ SettingsService            │
│ PortablePromptService      │
│ AppDataStore / SafeStorage │
│ GeminiLiveAdapter          │
└─────────────┬──────────────┘
              │ WSS / Realtime
┌─────────────▼──────────────┐
│      Gemini Live API       │
└────────────────────────────┘
```
