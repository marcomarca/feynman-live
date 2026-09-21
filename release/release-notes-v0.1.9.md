# Feynman Live v0.1.9

Sistema de auto-actualización in-place para la versión portable de Windows, descarga con indicador de progreso en vivo dentro de la aplicación, reinicio con reemplazo en caliente desacoplado y limpieza de artefactos en releases.

## Novedades y correcciones principales

* **Auto-Actualización In-Place para la Versión Portable**:
  * La versión portable (`.exe`) ahora cuenta con un protocolo integrado de actualización completa dentro de la aplicación, sin redirigir al navegador ni requerir que el usuario descargue o reemplace manualmente el archivo.
  * **Descarga en Segundo Plano con Progreso en Vivo**: Al detectar una nueva versión en GitHub Releases, la aplicación descarga el nuevo binario directamente en la carpeta temporal del sistema (`%TEMP%`), transmitiendo en tiempo real el porcentaje de avance y la cantidad de megabytes transferidos (`MB / MB`).
  * **Aviso y Diálogo Nativo de Confirmación**: Al completarse la descarga y verificarse la integridad del archivo, el estado pasa a `ready_to_install`, habilitando el botón **"Reiniciar y actualizar"** tanto en la vista de Configuración como en un cuadro de diálogo nativo de Windows.
  * **Reemplazo en Caliente Desacoplado**:
    * Al aceptar el reinicio, la aplicación localiza la ruta física del ejecutable portable original mediante `process.env.PORTABLE_EXECUTABLE_FILE`.
    * Genera y lanza de manera desacoplada (`detached: true`, `windowsHide: true`) un script por lotes auxiliar (`feynman-portable-updater.cmd`).
    * El script espera a que el proceso actual de Feynman Live finalice completamente mediante `tasklist`, realiza una secuencia de reintentos seguros de sobreescritura (`copy /y`) para superar los bloqueos de archivo de Windows, lanza automáticamente la nueva versión actualizada y se autodestruye junto con los archivos temporales.

* **Limpieza de Artefactos de Release**:
  * Se configuró el empaquetador para generar exclusivamente el binario portable en Windows (`Feynman-Live-v0.1.9-windows-portable.exe`).
  * Se eliminaron los objetivos y artefactos residuales de NSIS (`latest.yml`, `.blockmap`, instaladores duplicados `Setup.exe`), dejando un único ejecutable portable limpio para Windows.

## Descargas directas

| Plataforma | Tipo de archivo | Enlace de descarga |
|---|---|---|
| **Windows** | `Portable .exe (Auto-actualizable)` | [`Feynman-Live-v0.1.9-windows-portable.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.9/Feynman-Live-v0.1.9-windows-portable.exe) |
| **Android** | `APK .apk` | [`Feynman-Live-v0.1.9-android.apk`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.9/Feynman-Live-v0.1.9-android.apk) |
