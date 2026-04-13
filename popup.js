/**
 * popup.js — Controlador del Popup
 */

const btnGenerate = document.getElementById('btn-generate');
const statusEl    = document.getElementById('status');
const fechaDesde  = document.getElementById('fecha-desde');
const fechaHasta  = document.getElementById('fecha-hasta');

function log(text, type = 'info') {
  statusEl.classList.add('visible');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = text;
  statusEl.appendChild(line);
  statusEl.scrollTop = statusEl.scrollHeight;
}

function resetButton() {
  btnGenerate.disabled = false;
  btnGenerate.textContent = 'Generar y Descargar Reporte';
}

/**
 * Inyecta content.js en la pestaña si aún no está cargado,
 * luego envía el mensaje y espera la respuesta.
 */
async function enviarMensaje(tabId, payload) {
  // 1. Inyectar el script (si ya existe, el guard en content.js lo ignorará)
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  // 2. Pequeña pausa para que el script se inicialice
  await new Promise(r => setTimeout(r, 400));

  // 3. Enviar mensaje y esperar respuesta
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

btnGenerate.addEventListener('click', async () => {
  statusEl.innerHTML = '';
  statusEl.classList.remove('visible');
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Procesando…';
  log('Conectando con la pestaña activa…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) throw new Error('No se encontró una pestaña activa.');

    if (!tab.url?.includes('his.medicenter.cl')) {
      throw new Error(
        'La pestaña activa no es el portal HIS MediCenter. ' +
        'Navega al portal e intenta de nuevo.'
      );
    }

    const payload = {
      action: 'INICIAR_REPORTE',
      config: {
        fechaDesde: fechaDesde.value,
        fechaHasta: fechaHasta.value
      }
    };

    log(`Rango: ${payload.config.fechaDesde} → ${payload.config.fechaHasta}`);

    const response = await enviarMensaje(tab.id, payload);

    if (response?.success) {
      log(response.message, 'success');
    } else {
      log(response?.message || 'Error desconocido.', 'error');
    }

  } catch (err) {
    log(err.message, 'error');
  } finally {
    resetButton();
  }
});
