# Feynman Live v0.1.6

Sistema integral de comprobación y aplicación de actualizaciones en la aplicación (Desktop PC y Android), con soporte dedicado para ediciones Portables e Instaladas.

## Novedades principales

* **Panel de Actualizaciones en Configuración**:
  * Nueva sección interactiva **"Actualizaciones del Sistema"** dentro del modal de Configuración.
  * Muestra la versión actual instalada (`v0.1.6`) junto con un distintivo que identifica si se ejecuta en modo **Portable** o **Instalado**.
  * Botón **"Buscar actualizaciones"** con estados reactivos (*Buscando...*, *Al día*, *Actualización disponible*, *Descargando en segundo plano*).

* **Soporte Completo para la Edición Portable**:
  * En Windows, un ejecutable portable en ejecución no puede sobreescribir su propio binario en caliente sin generar bloqueos del sistema operativo (`EPERM`).
  * En modo portable, la aplicación consulta la API de GitHub Releases, localiza el ejecutable portable más reciente (`Feynman-Live-vX.X.X-windows-portable.exe`) y ofrece el botón **"Descargar ejecutable vX.X.X"** para descargarlo directamente en 1 clic.
  * Verificación periódica en segundo plano cada 2 horas sin interrumpir el funcionamiento ni causar bloqueos.

* **Ciclo de Actualización Automática para Edición Instalada (NSIS)**:
  * Descarga transparente en segundo plano mediante `electron-updater`.
  * Botón interactivo **"Reiniciar y aplicar"** que reinicia la aplicación e instala la nueva versión de inmediato sin intervención manual adicional.

* **Actualización Multiplataforma**:
  * Versión sincronizada en Android (`versionCode = 4`, `versionName = "0.1.6"`).
  * Distintivo de versión actualizado en la barra superior a `v0.1.6 • Studio`.

## Descargas directas

| Plataforma | Tipo de archivo | Enlace de descarga |
|---|---|---|
| **Windows** | `Instalador Setup .exe` | [`Feynman-Live-Setup-0.1.6.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.6/Feynman-Live-Setup-0.1.6.exe) |
| **Windows** | `Portable .exe` | [`Feynman-Live-v0.1.6-windows-portable.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.6/Feynman-Live-v0.1.6-windows-portable.exe) |
| **Android** | `APK .apk` | [`Feynman-Live-v0.1.6-android.apk`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.6/Feynman-Live-v0.1.6-android.apk) |
