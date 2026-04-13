/**
 * ═══════════════════════════════════════════════════════════════
 *  popup.js — Controlador del Popup
 * ═══════════════════════════════════════════════════════════════
 *  Responsabilidades:
 *    1. Capturar clic en "Generar y Descargar Reporte"
 *    2. Leer configuración del popup (fechas, etc.)
 *    3. Enviar mensaje al content.js de la pestaña activa
 *    4. Mostrar el log de progreso que devuelve content.js
 * ═══════════════════════════════════════════════════════════════
 */

const btnGenerate = document.getElementById('btn-generate');
const statusEl    = document.getElementById('status');
const fechaDesde  = document.getElementById('fecha-desde');
const fechaHasta  = document.getElementById('fecha-hasta');

// ── Utilidad: agregar línea al log visible ──────────────────
function log(text, type = 'info') {
  statusEl.classList.add('visible');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = text;
  statusEl.appendChild(line);
  statusEl.scrollTop = statusEl.scrollHeight;
}

// ── Handler del botón principal ─────────────────────────────
btnGenerate.addEventListener('click', async () => {
  // Limpiar log anterior
  statusEl.innerHTML = '';
  statusEl.classList.remove('visible');

  // Deshabilitar botón mientras corre
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Procesando…';
  log('Conectando con la pestaña activa…');

  try {
    // 1. Obtener la pestaña activa
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab) {
      throw new Error('No se encontró una pestaña activa.');
    }

    // Validar que estamos en el dominio correcto
    if (!tab.url?.includes('his.medicenter.cl')) {
      throw new Error(
        'La pestaña activa no es el portal HIS MediCenter. ' +
        'Navega al portal e intenta de nuevo.'
      );
    }

    // 2. Construir payload con la configuración del popup
    const payload = {
      action: 'INICIAR_REPORTE',
      config: {
        fechaDesde: fechaDesde.value,
        fechaHasta: fechaHasta.value
      }
    };

    log(`Rango: ${payload.config.fechaDesde} → ${payload.config.fechaHasta}`);

    // 3. Enviar mensaje al content.js
    chrome.tabs.sendMessage(tab.id, payload, (response) => {
      if (chrome.runtime.lastError) {
        log(
          'Error de comunicación: ' + chrome.runtime.lastError.message,
          'error'
        );
        resetButton();
        return;
      }

      if (response?.success) {
        log(response.message, 'success');
      } else {
        log(response?.message || 'Error desconocido.', 'error');
      }

      resetButton();
    });

  } catch (err) {
    log(err.message, 'error');
    resetButton();
  }
});

function resetButton() {
  btnGenerate.disabled = false;
  btnGenerate.textContent = 'Generar y Descargar Reporte';
}
