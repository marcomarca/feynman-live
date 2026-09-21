# Feynman Live v0.1.4 / v0.1.5

Mejora en la experiencia de usuario: aislamiento completo de material de estudio por conversación y simplificación de la barra superior.

## Novedades principales

* **Aislamiento de Material de Estudio por Conversación**:
  * Al iniciar una nueva conversación ("Nuevo Chat"), el material de estudio inicia completamente limpio y desde cero, sin heredar temas de conversaciones anteriores ni sobreescribirse con archivos globales residuales.
  * Cada sesión mantiene su propio material de estudio independiente: al alternar entre conversaciones, la interfaz refleja fielmente el material correspondiente a cada una.
  * El editor de material de estudio actualiza y persiste los cambios de forma atómica en la conversación activa.
* **Reubicación de Continuidad de Historial a Configuración**:
  * Se eliminó el botón confuso de dos estados ("Contexto: Activo" / "Contexto: Desde Cero") de la cabecera del playground.
  * Se incorporó la opción **"Iniciar con contexto previo"** dentro del panel de **Configuración**:
    * Al estar activada (por defecto), al retomar una conversación previa con mensajes, el tutor recordará todo el contexto acumulado.
    * Al estar desactivada, cualquier sesión iniciará limpia sin arrastrar historial de turnos pasados.
* **Sincronización Multiplataforma**:
  * Alineación del comportamiento de escritorio con la configuración nativa de Android (`includeHistoryOnResume`).

## Descargas directas

| Plataforma | Tipo de archivo | Enlace de descarga |
|---|---|---|
| **Windows** | `Instalador Setup .exe` | [`Feynman-Live-Setup-0.1.5.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.5/Feynman-Live-Setup-0.1.5.exe) (~87.7 MB) |
| **Windows** | `Portable .exe` | [`Feynman-Live-v0.1.5-windows-portable.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.5/Feynman-Live-v0.1.5-windows-portable.exe) (~87.2 MB) |
| **Android** | `APK .apk` | [`Feynman-Live-v0.1.5-android.apk`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.5/Feynman-Live-v0.1.5-android.apk) (~20.6 MB) |
