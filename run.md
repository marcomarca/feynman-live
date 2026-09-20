# Feynman Live — Guía de Comandos y Flujo de Trabajo

Este documento resume los comandos esenciales para instalación, desarrollo, pruebas, control de calidad y empaquetado del proyecto.

---

## 1. Requisitos Previos

- **Bun** (>= 1.1.x) — Gestor de paquetes, task runner y test runner del proyecto.
- **Node.js** (>= 20.x) — Requerido para Electron y dependencias del ecosistema.
- **Windows** — Plataforma objetivo principal del ejecutable.

---

## 2. Instalación de Dependencias

```bash
# Instalar todas las dependencias
bun install
```

---

## 3. Configuración de Entorno

Crear archivo `.env` a partir de la plantilla:

```bash
cp .env.example .env
```

Contenido de `.env`:
```env
# Clave de API de Google Gemini (opcional si se configura desde la UI de la app)
GEMINI_API_KEY=tu_clave_aqui
```

---

## 4. Entorno de Desarrollo

El desarrollo utiliza Bun para compilar procesos Node/Electron y Vite para el renderizador React.

```bash
# Iniciar servidor de desarrollo de Vite y compilar main/preload
bun run dev

# En una terminal paralela, lanzar la ventana de Electron
bun run dev:electron
```

### Ejecución de componentes individuales

```bash
# Compilar únicamente el proceso Main en modo desarrollo
bun run dev:main

# Compilar únicamente el script Preload en modo desarrollo
bun run dev:preload
```

---

## 5. Control de Calidad y Pruebas

```bash
# Ejecutar suite de pruebas unitarias
bun test

# Verificación estática de tipos TypeScript
bun run typecheck

# Análisis estático y linter (Biome)
bun run lint

# Formateo automático de código (Biome)
bun run format

# Verificación completa (Typecheck + Lint + Tests)
bun run check
```

---

## 6. Compilación (Build)

Genera los bundles de producción en `dist/` (React/Vite) y `dist-electron/` (Electron Main & Preload).

```bash
# Compilar todo (Typecheck + Main + Preload + Renderer)
bun run build

# Compilar únicamente el proceso Main
bun run build:main

# Compilar únicamente el proceso Preload
bun run build:preload

# Compilar únicamente el Renderer (Vite frontend)
bun run build:renderer
```

### Probar build de producción localmente

```bash
# Compila todo y lanza Electron sobre los archivos empaquetados
bun start
```

---

## 7. Empaquetado y Distribución

Usa `electron-builder` para generar los binarios para Windows en la carpeta `release/`.

```bash
# Generar instalador ejecutable de Windows (.exe / NSIS)
bun run package

# Generar versión portable / desempaquetada en directorio (release/win-unpacked)
bun run package:dir
```

---

---

## 8. Desarrollo en Android

Para depurar en Android sin generar ni instalar APKs manualmente:

```bash
# Compila incrementalmente, instala vía ADB y lanza la app en el dispositivo/emulador
bun run dev:android
```

---

## 9. Tabla Resumen de Comandos

| Comando | Acción |
| :--- | :--- |
| `bun install` | Instala dependencias del proyecto |
| `bun run dev` | Compila scripts e inicia servidor Vite |
| `bun run dev:electron` | Lanza ventana Electron conectada a Vite |
| `bun run dev:android` | Compila, instala y lanza app Android en modo Debug |
| `bun start` | Compila y corre Electron en modo local producción |
| `bun test` | Ejecuta tests con Bun |
| `bun run typecheck` | Ejecuta `tsc --noEmit` |
| `bun run lint` | Ejecuta linter Biome |
| `bun run format` | Aplica formato con Biome |
| `bun run check` | Pipeline completo de validación |
| `bun run build` | Compila TypeScript, Electron y Vite |
| `bun run package` | Genera instalador NSIS para Windows |
| `bun run package:dir` | Genera binario desempaquetado en carpeta |
