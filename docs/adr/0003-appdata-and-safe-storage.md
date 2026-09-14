# ADR 0003: AppData y SafeStorage

## Estado
Aceptado

## Contexto
Los datos del usuario (prompt de tutor, material de estudio y configuración) deben persistir entre sesiones sin usar una base de datos pesada. La API key de Gemini no debe guardarse en texto plano.

## Decisión
- Guardar `tutor-prompt.txt`, `study-material.txt` y `settings.json` en `%APPDATA%\Feynman Live\app-data\`.
- Cifrar la clave de Gemini usando `electron.safeStorage` (DPAPI en Windows) en `app-data\secrets\gemini-api-key.bin`.

## Consecuencias
- **Positivas:** Formato simple, legible, fácilmente respaldable e inspeccionable. La clave queda protegida a nivel del usuario de Windows.
- **Negativas:** La clave no puede compartirse entre diferentes usuarios de Windows en la misma máquina.
