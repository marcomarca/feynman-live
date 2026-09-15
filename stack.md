# Tecnologías — Feynman Live

Resumen conciso del stack tecnológico y herramientas utilizadas en el proyecto.

---

## 1. Desktop & Runtime
- **Electron (v34)**: Shell de escritorio (Chromium + Node.js) con arquitectura de procesos separados (`Main`, `Preload`, `Renderer`).
- **Node.js**: Runtime subyacente para el proceso Main y acceso al sistema operativo (archivos, cifrado con `safeStorage`, atajos globales).

## 2. Frontend (Renderer)
- **React 19**: Librería para la interfaz de usuario.
- **TypeScript**: Tipado estático estricto en toda la capa de componentes y estado.
- **Vanilla CSS**: Sistema de diseño con variables CSS nativas, temas oscuros y animaciones (sin frameworks CSS externos).
- **Web Audio API**: Captura de micrófono (PCM 16 kHz), reproducción de audio en tiempo real y visualización de ondas.

## 3. Inteligencia Artificial & Backend
- **Google GenAI SDK (`@google/genai`)**: Cliente oficial para comunicación con la API de Gemini.
- **Gemini Live API (`gemini-3.1-flash-live-preview`)**: Modelo multimodal con streaming full-duplex de voz y texto en tiempo real.
- **Local Fallback Engine**: Generador local de prompts portables (modo offline/resiliente sin dependencias externas).

## 4. Persistencia & Seguridad
- **Electron `safeStorage`**: Cifrado nativo a nivel de sistema operativo para la API Key.
- **Local Filesystem (`%APPDATA%`)**: Almacenamiento de sesiones, configuraciones y materiales en formato JSON local.

## 5. Tooling, Build & Empaquetado
- **Bun**: Gestor de paquetes, bundler del proceso Main/Preload (`bun build`) y ejecutor de pruebas (`bun test`).
- **Vite 6**: Servidor de desarrollo y bundler optimizado para el Renderer (React).
- **Biome**: Linter y formateador de código ultrarrápido.
- **Electron Builder**: Empaquetador y generador de instaladores para Windows (`.exe` NSIS).
