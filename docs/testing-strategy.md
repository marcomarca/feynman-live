# Estrategia de Testing — Feynman Live

## Niveles de Prueba

### 1. Pruebas Unitarias (`tests/unit/`)
- **Compilador Portable:** Verificación del formato canónico exacto, sanitización y delimitadores de bloques.
- **Mapeo de Errores:** Traducción de errores HTTP, WebSocket y Gemini a `AppErrorCode`.
- **Máquina de Estados:** Transiciones deterministas (`idle` -> `connecting` -> `listening` -> `speaking` -> `reconnecting` -> `error`).
- **Conversión de Audio PCM:** Comprobación de funciones de conversión Float32 <-> PCM16 16kHz / 24kHz.
- **Validación de Configuración:** Esquemas de configuración y valores por defecto.

### 2. Pruebas de Integración (`tests/integration/`)
- **Persistencia AppData:** Lectura y escritura atómica en carpetas de prueba temporales.
- **Secret Store:** Almacenamiento seguro y fallback de secretos.
- **External Providers:** Verificación de URLs permitidas en la allowlist.
- **StudySessionService:** Orquestación de sesión con `FakeLiveTutorProvider`.

### 3. Comandos de Calidad
- `bun test`: Ejecuta toda la suite automatizada.
- `bun run typecheck`: Comprobación de tipos con `tsc --noEmit`.
- `bun run lint`: Análisis estático con Biome.
- `bun run build`: Verificación de empaquetado y bundles.
