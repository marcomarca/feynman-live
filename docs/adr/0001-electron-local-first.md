# ADR 0001: Electron Local-First

## Estado
Aceptado

## Contexto
El usuario requiere una aplicación de escritorio de baja fricción en Windows con acceso a audio por WebAudio/AudioWorklet, atajo global de teclado, soporte para System Tray y persistencia local sin depender de servidores backend.

## Decisión
Usar Electron + React + Vite con arquitectura local-first. No implementar servidores intermediarios ni bases de datos para uso personal.

## Consecuencias
- **Positivas:** Máxima velocidad de arranque, control total de audio en cliente, datos almacenados privadamente en la máquina del usuario.
- **Negativas:** La clave API se almacena de forma local protegida por el OS del usuario.
