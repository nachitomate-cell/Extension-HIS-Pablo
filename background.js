/**
 * background.js — Service Worker
 */

// ── Descarga explícita desde content.js (blob URLs) ───────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'DESCARGAR_ARCHIVO') return;

  const nombreArchivo = message.filename.replace(/^.*[\\/]/, '');
  const rutaFinal = `MediCenter DIA/${nombreArchivo}`;

  chrome.downloads.download({
    url:      message.url,
    filename: rutaFinal,
    saveAs:   false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[MediCenter BG] Error:', chrome.runtime.lastError.message);
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
    } else {
      console.log(`[MediCenter BG] Descarga blob: ${rutaFinal} (id=${downloadId})`);
      sendResponse({ ok: true, downloadId });
    }
  });

  return true;
});

// ── Renombrar CUALQUIER descarga que venga del portal ─────────────
// Intercepta antes de que Chrome asigne el nombre final al archivo.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  // Solo actuar en descargas del portal HIS
  const esDelPortal = item.url.includes('his.medicenter.cl') ||
                      item.referrer?.includes('his.medicenter.cl') ||
                      item.url.startsWith('blob:');

  if (!esDelPortal) return; // dejar comportamiento normal

  // Leer la fecha guardada por content.js justo antes del click
  chrome.storage.local.get('fechaDescarga', (result) => {
    const fecha = result.fechaDescarga;
    const fechaStr = fecha
      ? fecha.replace(/\//g, '-')          // "08/04/2026" → "08-04-2026"
      : `reporte_${Date.now()}`;

    const ext = item.filename.match(/\.\w+$/)?.[0] || '.xlsx';
    const nuevoNombre = `MediCenter DIA/${fechaStr}${ext}`;

    console.log(`[MediCenter BG] Renombrando → ${nuevoNombre}`);
    suggest({ filename: nuevoNombre, conflictAction: 'uniquify' });
  });

  return true; // respuesta asíncrona
});
