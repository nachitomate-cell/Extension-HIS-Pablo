/**
 * ═══════════════════════════════════════════════════════════════════════
 *  content.js — Script de automatización inyectado en el DOM del portal
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  FLUJO:
 *    1. Recibe mensaje desde popup.js
 *    2. Llena los filtros del formulario (selects, inputs)
 *    3. Dispara eventos nativos para que el framework JS detecte cambios
 *    4. Hace clic en "Buscar"
 *    5. Espera (MutationObserver + polling) a que aparezca el botón de
 *       descarga Excel
 *    6. Hace clic en él para descargar
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 1: SELECTORES CSS                                     ██
// ██                                                                 ██
// ██  ¡¡ EDITA ESTOS VALORES CON LOS SELECTORES REALES !!           ██
// ██  Usa el Inspector del navegador (F12 → Elements) para           ██
// ██  encontrar los id, name, o clases de cada elemento.             ██
// ─────────────────────────────────────────────────────────────────────

const SELECTORS = {

  // ── Filtros (dropdowns / inputs) ────────────────────────────────
  // Ejemplo: si el <select> de sucursal tiene id="suc_Id",
  //          pon aquí '#suc_Id'

  /** Select de Sucursal (ej: "PUENTE ALTO") */
  SUCURSAL:           '#suc_Id',                       // ← EDITAR

  /** Input de Fecha (el campo date-picker) */
  FECHA:              'input[name="daterange"]',       // ← EDITAR

  /** Select de Servicio (ej: "ECOTOMOGRAFIA") */
  SERVICIO:           '#ser_id',                       // ← EDITAR

  /** Select de Profesional */
  PROFESIONAL:        '#pro_id',                       // ← EDITAR

  /** Select de Sala */
  SALA:               '#sala_id',                      // ← EDITAR

  // ── Botones de acción ──────────────────────────────────────────

  /** Botón que ejecuta la búsqueda / genera la tabla */
  BTN_BUSCAR:         'button.btn-search',             // ← EDITAR
  //                   Alternativas comunes:
  //                   'button[type="submit"]'
  //                   '#btnBuscar'
  //                   '.btn-primary' (si es único)

  /** Botón/enlace de "Excel" que aparece DESPUÉS de la búsqueda */
  BTN_EXCEL:          'a.buttons-excel',               // ← EDITAR
  //                   DataTables suele generar:
  //                   'a.buttons-excel'  o  'button.buttons-excel'
  //                   Verifica con el Inspector tras una búsqueda manual.

  // ── Tabla de resultados (para saber cuándo terminó de cargar) ──

  /** Contenedor de la tabla o la tabla misma */
  TABLA_RESULTADOS:   '#dataTable_wrapper',            // ← EDITAR
  //                   O el <table id="..."> directamente
};

// ── Valores por defecto para los filtros ─────────────────────────
// Si no se pasan desde el popup, usa estos.
const DEFAULT_VALUES = {
  SUCURSAL:     '30',               // ← value del <option> de "PUENTE ALTO"
  SERVICIO:     '193',              // ← value del <option> de "ECOTOMOGRAFIA"
  PROFESIONAL:  '1666',            // ← value del <option> del profesional
  SALA:         '',                 // ← vacío = "(No definida)"
};


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 2: UTILIDADES                                         ██
// ─────────────────────────────────────────────────────────────────────

/**
 * Pausa asincrónica (milisegundos).
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cambia el valor de un <select> y dispara los eventos necesarios
 * para que frameworks como jQuery / DataTables / Knockout detecten
 * el cambio.
 *
 * @param {string} selector  – CSS selector del <select>
 * @param {string} value     – Valor del <option> a seleccionar
 */
function setSelectValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[MediCenter Ext] Select no encontrado: ${selector}`);
    return false;
  }

  // Asignar valor
  el.value = value;

  // Disparar eventos nativos + jQuery (por si el portal usa $.trigger)
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input',  { bubbles: true }));

  // Si jQuery está disponible, disparar también por jQuery
  if (typeof jQuery !== 'undefined') {
    jQuery(el).trigger('change');
  }

  console.log(`[MediCenter Ext] ${selector} → "${value}"`);
  return true;
}

/**
 * Cambia el valor de un <input> (texto, fecha, etc.) y dispara eventos.
 *
 * @param {string} selector  – CSS selector del input
 * @param {string} value     – Valor a asignar
 */
function setInputValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[MediCenter Ext] Input no encontrado: ${selector}`);
    return false;
  }

  // Para inputs de React / Angular, necesitamos el setter nativo
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(el, value);

  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  // jQuery fallback
  if (typeof jQuery !== 'undefined') {
    jQuery(el).val(value).trigger('change');
  }

  console.log(`[MediCenter Ext] ${selector} → "${value}"`);
  return true;
}

/**
 * Espera a que un elemento aparezca en el DOM.
 * Combina MutationObserver (eficiente) con un timeout de seguridad.
 *
 * @param {string}  selector    – CSS selector del elemento esperado
 * @param {number}  timeoutMs   – Tiempo máximo de espera (ms)
 * @returns {Promise<Element>}  – Resuelve con el elemento encontrado
 */
function waitForElement(selector, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    // Caso 1: ya existe
    const existing = document.querySelector(selector);
    if (existing) {
      return resolve(existing);
    }

    let settled = false;

    // Caso 2: MutationObserver para detectar inserción
    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el && !settled) {
        settled = true;
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Caso 3: Polling de respaldo (por si el Observer pierde algún cambio)
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el && !settled) {
        settled = true;
        clearInterval(interval);
        observer.disconnect();
        resolve(el);
      }
    }, 500);

    // Timeout de seguridad
    setTimeout(() => {
      if (!settled) {
        settled = true;
        clearInterval(interval);
        observer.disconnect();
        reject(new Error(
          `Timeout: "${selector}" no apareció en ${timeoutMs / 1000}s`
        ));
      }
    }, timeoutMs);
  });
}


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 3: FLUJO PRINCIPAL DE AUTOMATIZACIÓN                  ██
// ─────────────────────────────────────────────────────────────────────

/**
 * Orquesta todo el flujo:
 *   llenar filtros → buscar → esperar Excel → descargar
 *
 * @param {object} config  – Configuración enviada desde el popup
 */
async function ejecutarReporte(config = {}) {
  console.log('[MediCenter Ext] Iniciando automatización…', config);

  // ── Paso 1: Llenar los filtros del formulario ─────────────────

  // 1a. Sucursal
  setSelectValue(SELECTORS.SUCURSAL, DEFAULT_VALUES.SUCURSAL);
  await sleep(300); // Pausa breve para que el portal actualice dependencias

  // 1b. Servicio
  setSelectValue(SELECTORS.SERVICIO, DEFAULT_VALUES.SERVICIO);
  await sleep(300);

  // 1c. Profesional
  setSelectValue(SELECTORS.PROFESIONAL, DEFAULT_VALUES.PROFESIONAL);
  await sleep(300);

  // 1d. Sala (si aplica)
  if (DEFAULT_VALUES.SALA) {
    setSelectValue(SELECTORS.SALA, DEFAULT_VALUES.SALA);
    await sleep(200);
  }

  // 1e. Fecha — construir rango desde la config del popup
  const desde = config.fechaDesde || '01/04/2026';
  const hasta = config.fechaHasta || '13/04/2026';

  // El daterangepicker suele esperar formato DD/MM/YYYY
  const fechaFormateada = `${formatDate(desde)} - ${formatDate(hasta)}`;
  setInputValue(SELECTORS.FECHA, fechaFormateada);
  await sleep(300);

  console.log('[MediCenter Ext] Filtros llenados. Buscando…');

  // ── Paso 2: Clic en botón Buscar ──────────────────────────────
  const btnBuscar = document.querySelector(SELECTORS.BTN_BUSCAR);
  if (!btnBuscar) {
    throw new Error(
      `Botón de búsqueda no encontrado: "${SELECTORS.BTN_BUSCAR}". ` +
      'Verifica el selector en content.js → SELECTORS.BTN_BUSCAR'
    );
  }
  btnBuscar.click();
  console.log('[MediCenter Ext] Clic en Buscar ejecutado.');

  // ── Paso 3: Esperar a que aparezca el botón de Excel ──────────
  console.log('[MediCenter Ext] Esperando botón de Excel…');

  const btnExcel = await waitForElement(SELECTORS.BTN_EXCEL, 45000);
  console.log('[MediCenter Ext] ¡Botón de Excel detectado!');

  // Pausa mínima para asegurar que el botón esté interactivo
  await sleep(500);

  // ── Paso 4: Clic en descargar Excel ───────────────────────────
  btnExcel.click();
  console.log('[MediCenter Ext] ¡Descarga de Excel iniciada!');

  return { success: true, message: 'Reporte descargado exitosamente.' };
}


// ── Helper: convierte YYYY-MM-DD → DD/MM/YYYY ──────────────────
function formatDate(isoDate) {
  if (!isoDate) return '';
  // Si ya viene en DD/MM/YYYY, devolver tal cual
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 4: LISTENER DE MENSAJES (COMUNICACIÓN CON POPUP)      ██
// ─────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'INICIAR_REPORTE') return;

  // Ejecutar el flujo y responder al popup
  ejecutarReporte(message.config)
    .then((result) => {
      sendResponse(result);
    })
    .catch((err) => {
      console.error('[MediCenter Ext] Error:', err);
      sendResponse({
        success: false,
        message: `Error: ${err.message}`
      });
    });

  // IMPORTANTE: retornar true indica a Chrome que sendResponse
  // se llamará de forma asíncrona.
  return true;
});

console.log('[MediCenter Ext] Content script cargado y listo.');
