# Feynman Live v0.1.7

Auditoría integral y pulido de estilos de la interfaz de usuario en la aplicación de escritorio Electron y sincronización de versión multiplataforma.

## Novedades y correcciones principales

* **Corrección de Botones Sin Estilo**:
  * **Modal de Material y Prompt**: Se corrigió el botón de cierre del pie del modal que utilizaba `className="btn-primary"` sin la clase base `.btn`, recuperando padding, bordes redondeados, tipografía del sistema y cursor pointer mediante el componente `<Button variant="primary">`.
  * **Icono de Cierre en Drawer**: Reemplazo del carácter plano de texto `✕` por el icono vectorial SVG estándar de cierre.
  * **Confirmación de Eliminación en Sidebar**: Los botones de acción de confirmación de borrado de chat (`Cancelar` y `Eliminar definitivamente`) ahora utilizan el componente `<Button>` con estilos `secondary` y `danger` completos.
  * **Botón de Cerrar en Barra de Título**: Incorporación de feedback visual en rojo (`.btn-icon-close:hover`) al pasar el cursor sobre el botón de ocultar/cerrar la ventana.

* **Resolución de Anidamiento Inválido de Botones**:
  * En la barra lateral (`ChatSidebar`), las filas de chat se transformaron de `<button>` anidado a un contenedor interactivo accesible con `role="button"` y soporte de teclado (`Enter` / `Espacio`), eliminando el anidamiento inválido de `<button>` dentro de `<button>` que provocaba artefactos de foco y eventos en Chromium.

* **Checkboxes Nativos y Filas de Ajustes Modernizadas**:
  * Eliminación del checkbox nativo gris por defecto de Windows en el modal de Configuración.
  * Implementación de checkboxes personalizados (`input[type="checkbox"]`) con fondo oscuro, gradiente índigo, halo de foco y checkmark vectorial blanco.
  * Nueva estructura de filas de configuración interactiva (`.setting-toggle-row`) para `launchAtLogin` e `iniciar con contexto previo` con descripciones legibles y hover suave.

* **Selects y Dropdowns Estilizados**:
  * Las listas desplegables (`.form-select`) ahora cuentan con `appearance: none`, flecha vectorial chevron integrada y opciones tematizadas con fondo oscuro coherente con el modo oscuro.

* **Estado Hero en Playground Vacío**:
  * Cuando una conversación no contiene mensajes, el área principal muestra una tarjeta hero centrada (`.studio-empty-hero`) con icono socrático iluminado, mensaje explicativo de la Técnica Feynman y etiquetas informativas de inicio rápido.

* **Scrubber y Reproductor de Audio**:
  * Pulido del control deslizante del reproductor de audio (`.audio-player-slider`) con `appearance: none`, altura consistente y animación de escala en hover sobre el scrubber.

* **Previsualización de Paquete de Estudio en Fallback**:
  * Área de texto de previsualización estilizada (`.fallback-preview-textarea`) con tipografía monospace, borde enfocado y scrollbars fluidas.

## Descargas directas

| Plataforma | Tipo de archivo | Enlace de descarga |
|---|---|---|
| **Windows** | `Instalador Setup .exe` | [`Feynman-Live-Setup-0.1.7.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.7/Feynman-Live-Setup-0.1.7.exe) |
| **Windows** | `Portable .exe` | [`Feynman-Live-v0.1.7-windows-portable.exe`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.7/Feynman-Live-v0.1.7-windows-portable.exe) |
| **Android** | `APK .apk` | [`Feynman-Live-v0.1.7-android.apk`](https://github.com/marcomarca/feynman-live/releases/download/v0.1.7/Feynman-Live-v0.1.7-android.apk) |
