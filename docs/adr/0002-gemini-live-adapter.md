# ADR 0002: Gemini Live Adapter

## Estado
Aceptado

## Contexto
El modelo Gemini Live (`gemini-3.1-flash-live-preview`) se encuentra en preview y los contratos de protocolo pueden evolucionar. No se debe acoplar el dominio ni la UI al SDK `@google/genai`.

## Decisión
Encapsular toda interacción con Gemini detrás de la interfaz `LiveTutorProvider` e implementar `GeminiLiveAdapter` como el único punto de contacto con el SDK.

## Consecuencias
- **Positivas:** Permite cambiar de modelo, proveedor o simular respuestas en tests con `FakeLiveTutorProvider`.
- **Negativas:** Requiere una capa de mapeo bidireccional entre eventos de Gemini y tipos de dominio.
