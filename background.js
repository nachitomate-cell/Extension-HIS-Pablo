/**
 * background.js — Service Worker
 *
 * Recibe solicitudes de descarga desde content.js y las guarda
 * directamente en la carpeta de Descargas sin mostrar diálogo.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'DESCARGAR_ARCHIVO') return;

  // Guardar siempre dentro de la carpeta "MediCenter DIA"
  const nombreArchivo = message.filename.replace(/^.*[\\/]/, ''); // quitar rutas previas
  const rutaFinal = `MediCenter DIA/${nombreArchivo}`;

  chrome.downloads.download({
    url:      message.url,
    filename: rutaFinal,
    saveAs:   false               // nunca mostrar diálogo "Guardar como"
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[MediCenter BG] Error al descargar:', chrome.runtime.lastError.message);
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
    } else {
      console.log(`[MediCenter BG] Descarga iniciada (id=${downloadId}): ${message.filename}`);
      sendResponse({ ok: true, downloadId });
    }
  });

  return true; // respuesta asíncrona
});
