# ADR 0004: Fallback Portable Autónomo

## Estado
Aceptado

## Contexto
Los servicios Live y las cuotas gratuitas pueden fallar, agotarse o estar indisponibles. El valor principal de estudio no debe perderse ante caídas externas.

## Decisión
El compilador de prompt portable (`PortablePromptCompiler`) es una función local y pura, independiente de red o credenciales, disponible en todo momento desde la interfaz. Permite copiar al portapapeles y abrir ChatGPT o Google AI Studio en el navegador externo del usuario.

## Consecuencias
- **Positivas:** La aplicación mantiene el 100% de su utilidad de compilación de contexto pedagógico sin cuotas ni conexión.
- **Negativas:** La interacción en fallback requiere copiar y pegar manualmente en el navegador.
