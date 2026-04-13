/**
 * ═══════════════════════════════════════════════════════════════════════
 *  content.js — Script de automatización inyectado en el DOM del portal
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  FLUJO (dos fases para sobrevivir recargas de página):
 *
 *  Fase 1 — al recibir el mensaje del popup:
 *    • Si el formulario ya está visible → llenar y buscar directamente.
 *    • Si hay que navegar → guardar config en sessionStorage,
 *      responder al popup de inmediato y hacer clic en el menú.
 *
 *  Fase 2 — al cargar cada página:
 *    • Revisar sessionStorage; si hay config pendiente y el formulario
 *      ya está en el DOM → llenar, buscar y descargar.
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 1: CONFIGURACIÓN                                      ██
// ─────────────────────────────────────────────────────────────────────

const SELECTORS = {
  // Navegación
  NAV_PRODUCCION:   'a[id="166"]',

  // Filtros del formulario
  SUCURSAL:         '#suc_Id',
  FECHA:            '#daterange',
  SERVICIO:         '#ser_id',
  PROFESIONAL:      '#pro_id',
  SALA:             '#sala_id',

  // Switch ON/OFF (bootstrap-switch)
  SWITCH:           '.bootstrap-switch-handle-on.bootstrap-switch-success',
};

const DEFAULT_VALUES = {
  SUCURSAL:    null,                              // null = "todas" automáticamente
  SERVICIO:    'ECOTOMOGRAFIA',                   // texto del <option>
  PROFESIONAL: 'TM.JUAN PABLO CARDENAS GALLEGUILLOS', // texto del <option>
  SALA:        '',
};

/** Clave usada en sessionStorage para persistir la config entre navegaciones */
const STORAGE_KEY = 'medicenter_ext_pending';

/** Fecha del día que se está procesando actualmente (DD/MM/YYYY).
 *  El interceptor de descargas la usa para nombrar el archivo. */
let fechaEnProceso = null;


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 2: UTILIDADES                                         ██
// ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Busca un <option> cuyo texto contenga `text` (insensible a mayúsculas)
 * y lo selecciona usando Select2 o nativo según corresponda.
 */
function setSelectByText(selector, text) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[MediCenter Ext] Select no encontrado: ${selector}`);
    return false;
  }
  const option = Array.from(el.options).find(o =>
    o.text.trim().toLowerCase().includes(text.trim().toLowerCase())
  );
  if (!option) {
    console.warn(`[MediCenter Ext] Opción "${text}" no encontrada en ${selector}`);
    return false;
  }
  return setSelectValue(selector, option.value);
}

/**
 * Busca el botón de Excel por el texto "Excel" dentro de sus hijos
 * y lo devuelve. Compatible con DataTables y otros renderers.
 */
function encontrarBotonExcel() {
  for (const el of document.querySelectorAll('button, a')) {
    if (el.textContent.trim() === 'Excel') return el;
  }
  return null;
}

/**
 * Intercepta la descarga de Excel generada por DataTables.
 *
 * DataTables crea un <a> temporal, le asigna un blob: URL y llama
 * elemento.click() directamente — sin disparar eventos del DOM.
 * Por eso hay que sobreescribir HTMLAnchorElement.prototype.click.
 */
function instalarInterceptorDescargas() {
  const clickOriginal = HTMLAnchorElement.prototype.click;

  HTMLAnchorElement.prototype.click = function () {
    // Solo interceptar si es blob con atributo download (export de DataTables)
    if (this.href && this.href.startsWith('blob:') && this.hasAttribute('download')) {
      const url = this.href;

      // Nombre: DD-MM-YYYY.xlsx según la fecha en proceso
      const fechaStr = fechaEnProceso
        ? fechaEnProceso.replace(/\//g, '-')   // "01/04/2026" → "01-04-2026"
        : `reporte_${Date.now()}`;
      const filename = `${fechaStr}.xlsx`;

      console.log(`[MediCenter Ext] Interceptando descarga → ${filename}`);

      chrome.runtime.sendMessage(
        { action: 'DESCARGAR_ARCHIVO', url, filename },
        (resp) => {
          if (resp?.ok) {
            console.log(`[MediCenter Ext] ✓ Guardado: ${filename}`);
          } else {
            console.error('[MediCenter Ext] Error descarga:', resp?.error);
          }
        }
      );

      // No llamar al click original: evita el diálogo del navegador
      return;
    }

    // Para cualquier otro <a>, comportamiento normal
    return clickOriginal.call(this);
  };

  console.log('[MediCenter Ext] Interceptor de descargas instalado.');
}

/**
 * Asegura que el switch "Mostrar todos los estados" (#chkTodosEstados)
 * esté en posición ON. Usa la API de bootstrapSwitch si está disponible;
 * si no, fuerza el estado del checkbox directamente.
 */
function asegurarSwitchOn() {
  const checkbox = document.querySelector('#chkTodosEstados');
  if (!checkbox) {
    console.warn('[MediCenter Ext] #chkTodosEstados no encontrado.');
    return;
  }

  const wrapper = checkbox.closest('.bootstrap-switch');
  const estaOn  = wrapper
    ? wrapper.classList.contains('bootstrap-switch-on')
    : checkbox.checked;

  if (estaOn) {
    console.log('[MediCenter Ext] Switch ya está ON');
    return;
  }

  // Intentar API de jQuery bootstrapSwitch
  if (typeof jQuery !== 'undefined') {
    try {
      jQuery(checkbox).bootstrapSwitch('state', true, true);
      console.log('[MediCenter Ext] Switch → ON (bootstrapSwitch API)');
      return;
    } catch (_) { /* no disponible, seguir con fallback */ }
  }

  // Fallback: marcar el checkbox y disparar eventos
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  if (typeof jQuery !== 'undefined') jQuery(checkbox).trigger('change');
  console.log('[MediCenter Ext] Switch → ON (checkbox fallback)');
}

function setSelectValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[MediCenter Ext] Select no encontrado: ${selector}`);
    return false;
  }
  if (typeof jQuery !== 'undefined' && jQuery(el).data('select2')) {
    jQuery(el).val(value).trigger('change');
  } else {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    if (typeof jQuery !== 'undefined') jQuery(el).trigger('change');
  }
  console.log(`[MediCenter Ext] ${selector} → "${value}"`);
  return true;
}

function setInputValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[MediCenter Ext] Input no encontrado: ${selector}`);
    return false;
  }
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (typeof jQuery !== 'undefined') jQuery(el).val(value).trigger('change');
  console.log(`[MediCenter Ext] ${selector} → "${value}"`);
  return true;
}

/**
 * Establece la fecha en el input #daterange (formato DD/MM/YYYY).
 * Dispara los eventos necesarios para que el portal detecte el cambio.
 *
 * @param {string} fechaDDMMYYYY  – Fecha en formato DD/MM/YYYY (ej: "01/04/2026")
 */
function setFecha(fechaDDMMYYYY) {
  const input = document.querySelector(SELECTORS.FECHA);
  if (!input) {
    console.warn('[MediCenter Ext] #daterange no encontrado.');
    return false;
  }

  // Setter nativo (necesario para frameworks que interceptan el valor)
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeSetter.call(input, fechaDDMMYYYY);

  // Eventos nativos
  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // jQuery como refuerzo
  if (typeof jQuery !== 'undefined') {
    jQuery(input).val(fechaDDMMYYYY).trigger('change');
  }

  console.log(`[MediCenter Ext] Fecha → ${fechaDDMMYYYY}`);
  return true;
}

function waitForElement(selector, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    let settled = false;

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el && !settled) {
        settled = true;
        observer.disconnect();
        clearInterval(interval);
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el && !settled) {
        settled = true;
        observer.disconnect();
        clearInterval(interval);
        resolve(el);
      }
    }, 500);

    setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        clearInterval(interval);
        reject(new Error(`Timeout: "${selector}" no apareció en ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);
  });
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate)) return isoDate;
  // Parsear local para evitar desfase de timezone
  const fecha = parsearFechaLocal(isoDate);
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 3: LÓGICA DE FORMULARIO                               ██
// ─────────────────────────────────────────────────────────────────────

function clickBuscar() {
  // Selector primario: id exacto del botón de búsqueda
  const btn = document.querySelector('#btnBuscar');

  if (!btn) throw new Error('#btnBuscar no encontrado en el formulario.');

  // jQuery primero (más compatible con los listeners del portal)
  if (typeof jQuery !== 'undefined') {
    jQuery(btn).trigger('click');
  }
  // MouseEvent nativo como respaldo
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  console.log('[MediCenter Ext] Clic en #btnBuscar ejecutado.');
}

/**
 * Hace clic en el botón "Mostrar todos los estados" (o similar).
 * Busca por texto en botones, checkboxes con label, y links.
 */
function clickMostrarTodosEstados() {
  const textos = ['mostrar todos', 'todos los estados', 'todos estados'];
  for (const el of document.querySelectorAll('button, a, label, input[type="checkbox"], input[type="button"]')) {
    const txt = el.textContent?.trim().toLowerCase() ?? '';
    if (textos.some(t => txt.includes(t))) {
      el.click();
      console.log(`[MediCenter Ext] Clic en "Mostrar todos los estados": ${el.textContent.trim()}`);
      return true;
    }
  }
  console.warn('[MediCenter Ext] Botón "Mostrar todos los estados" no encontrado — continuando igual.');
  return false;
}

/**
 * Parsea una fecha string a objeto Date LOCAL (sin problemas de timezone).
 * Acepta YYYY-MM-DD o DD/MM/YYYY.
 */
function parsearFechaLocal(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yyyy, mm, dd] = s.split('-').map(Number);
    return new Date(yyyy, mm - 1, dd); // mes 0-indexado, hora local
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/').map(Number);
    return new Date(yyyy, mm - 1, dd);
  }
  return new Date(s);
}

/**
 * Genera un array con todas las fechas (DD/MM/YYYY) entre desde y hasta, inclusive.
 */
function generarRangoDias(desde, hasta) {
  const start = parsearFechaLocal(desde);
  const end   = parsearFechaLocal(hasta);
  const dias  = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    dias.push(`${dd}/${mm}/${d.getFullYear()}`);
  }
  return dias;
}

/**
 * Retorna todas las opciones válidas (con value real) del select de sucursal.
 */
function getSucursales() {
  const el = document.querySelector(SELECTORS.SUCURSAL);
  if (!el) return [];
  return Array.from(el.options)
    .filter(o => o.value && o.value !== '0')
    .map(o => ({ value: o.value, text: o.text.trim() }));
}

/**
 * Busca en el select indicado un <option> cuyo texto contenga `texto`.
 * Devuelve su value, o null si no existe.
 */
function encontrarOptionPorTexto(selector, texto) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const opt = Array.from(el.options).find(o =>
    o.text.trim().toLowerCase().includes(texto.trim().toLowerCase())
  );
  return opt ? opt.value : null;
}

/**
 * Flujo completo día a día:
 *
 *  Para cada día del rango → para cada sucursal:
 *    1. Seleccionar sucursal + fecha
 *    2. Esperar que los selects dependientes se actualicen
 *    3. ¿Existe ECOTOMOGRAFIA en el select de servicio?  → No: siguiente sucursal
 *    4. Seleccionar ECOTOMOGRAFIA
 *    5. ¿Existe PABLO en el select de profesional?       → No: siguiente sucursal
 *    6. Seleccionar PABLO + activar switch ON
 *    7. Clic "Mostrar todos los estados"
 *    8. Clic Buscar → esperar → descargar Excel
 *    9. Pasar al siguiente día (PABLO solo trabaja en una sucursal por día)
 */
async function llenarFormularioYBuscar(config = {}) {
  const desde = config.fechaDesde || '01/04/2026';
  const hasta  = config.fechaHasta || '13/04/2026';
  const dias   = generarRangoDias(desde, hasta);
  const sucursales = getSucursales();

  if (!sucursales.length) throw new Error('No se encontraron sucursales en el select.');

  console.log(`[MediCenter Ext] Procesando ${dias.length} día(s) en ${sucursales.length} sucursal(es).`);

  let totalDescargados = 0;

  for (let dIdx = 0; dIdx < dias.length; dIdx++) {
    const dia = dias[dIdx];
    console.log(`[MediCenter Ext] ── Día: ${dia} ──`);
    fechaEnProceso = dia; // el interceptor usará esta fecha para nombrar el archivo

    // ── 0. Activar switch ANTES de elegir la fecha ────────────────
    asegurarSwitchOn();
    await sleep(300);

    // ── 1. Seleccionar la fecha del día ───────────────────────────
    setFecha(dia);
    await sleep(400);

    let encontrado = false;

    for (const suc of sucursales) {

      // 2. Seleccionar sucursal
      setSelectValue(SELECTORS.SUCURSAL, suc.value);
      await sleep(700); // esperar que los selects dependientes recarguen

      // 3. Verificar ECOTOMOGRAFIA
      const ecotoValue = encontrarOptionPorTexto(SELECTORS.SERVICIO, 'ECOTOMOGRAFIA');
      if (!ecotoValue) {
        console.log(`[MediCenter Ext]   ${suc.text} → sin ECOTOMOGRAFIA`);
        continue;
      }

      // 4. Seleccionar ECOTOMOGRAFIA
      setSelectValue(SELECTORS.SERVICIO, ecotoValue);
      await sleep(600); // esperar que profesional recargue

      // 5. Verificar PABLO
      const pabloValue = encontrarOptionPorTexto(SELECTORS.PROFESIONAL, 'PABLO');
      if (!pabloValue) {
        console.log(`[MediCenter Ext]   ${suc.text} → ECOTOMOGRAFIA ✓ | PABLO ✗`);
        continue;
      }

      // 6. Seleccionar PABLO
      setSelectValue(SELECTORS.PROFESIONAL, pabloValue);
      await sleep(300);

      console.log(`[MediCenter Ext]   ${suc.text} → ECOTOMOGRAFIA ✓ | PABLO ✓ → buscando…`);

      // 7. Buscar
      clickBuscar();
      await sleep(4000);

      // 8. Descargar Excel
      const btnExcel = encontrarBotonExcel();
      if (btnExcel) {
        // Guardar fecha actual para que background.js renombre el archivo
        chrome.storage.local.set({ fechaDescarga: dia });
        btnExcel.click();
        totalDescargados++;
        console.log(`[MediCenter Ext] ✓ Descargado: ${dia} | ${suc.text}`);
        await sleep(2000);

        // 9. Tras descargar: avanzar la fecha al día siguiente para
        //    "tocar" el campo y dejar el formulario listo
        const diaSiguiente = dias[dIdx + 1];
        if (diaSiguiente) {
          setFecha(diaSiguiente);
          await sleep(300);
        }
      }

      encontrado = true;
      break; // PABLO encontrado en esta sucursal; pasar al siguiente día
    }

    if (!encontrado) {
      console.log(`[MediCenter Ext] ✗ ${dia}: PABLO no encontrado en ninguna sucursal`);
    }
  }

  return {
    success: true,
    message: `Listo. ${totalDescargados} archivo(s) descargado(s) en ${dias.length} día(s).`
  };
}


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 4: NAVEGACIÓN                                         ██
// ─────────────────────────────────────────────────────────────────────

/**
 * Abre el submenú Produccion y hace clic en "Lista de trabajo V2".
 * NO espera a que cargue el formulario (eso lo maneja la Fase 2).
 */
async function navegarAListaTrabajoV2() {
  const navProduccion = document.querySelector(SELECTORS.NAV_PRODUCCION);
  if (!navProduccion) {
    throw new Error(
      `Enlace "Produccion" no encontrado (${SELECTORS.NAV_PRODUCCION}).`
    );
  }

  // Abrir submenú si está cerrado
  const liPadre = navProduccion.closest('li');
  const abierto = liPadre?.classList.contains('menu-open');
  if (!abierto) {
    navProduccion.click();
    await sleep(600);
  }

  // Buscar "Lista de trabajo V2" por texto
  const scope = liPadre ?? document;
  let enlace = null;
  for (const a of scope.querySelectorAll('a')) {
    if (a.textContent.trim().toLowerCase().includes('lista de trabajo v2')) {
      enlace = a;
      break;
    }
  }
  if (!enlace) {
    throw new Error('"Lista de trabajo V2" no encontrado en el submenú.');
  }

  enlace.click();
  console.log('[MediCenter Ext] Clic en "Lista de trabajo V2".');
}


// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 5: FASE 2 — retomar config tras navegación            ██
// ─────────────────────────────────────────────────────────────────────

/**
 * Se ejecuta al cargar cada página.
 * Si hay una config guardada en sessionStorage Y el formulario ya
 * está en el DOM, retoma la automatización sin necesitar al popup.
 */
async function retomarSiPendiente() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  // Esperar a que el formulario aparezca (máx. 10 s)
  const formulario = await waitForElement(SELECTORS.SUCURSAL, 10000).catch(() => null);
  if (!formulario) {
    // No estamos en la página correcta; dejar la config para la próxima carga
    return;
  }

  // Limpiar antes de ejecutar para evitar bucles si algo falla
  sessionStorage.removeItem(STORAGE_KEY);

  let config = {};
  try { config = JSON.parse(raw); } catch (_) {}

  await sleep(800); // Esperar que el portal inicialice los selects

  try {
    await llenarFormularioYBuscar(config);
  } catch (err) {
    console.error('[MediCenter Ext] Error en fase 2:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// ██  SECCIÓN 6: LISTENER DE MENSAJES (FASE 1)                      ██
// ─────────────────────────────────────────────────────────────────────

// Guard: evitar registrar el listener más de una vez si el script
// se inyecta varias veces en la misma pestaña.
if (window.__medicenterExtLoaded) {
  console.log('[MediCenter Ext] Script ya cargado, omitiendo re-inicialización.');
} else {
  window.__medicenterExtLoaded = true;
  instalarInterceptorDescargas();
  retomarSiPendiente();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'INICIAR_REPORTE') return;

  const config = message.config ?? {};
  const formularioVisible = !!document.querySelector(SELECTORS.SUCURSAL);

  // Siempre responder de inmediato para no bloquear el canal.
  // La automatización corre en segundo plano.
  if (formularioVisible) {
    sendResponse({
      success: true,
      message: 'Automatización iniciada en segundo plano. Revisa la consola (F12) para ver el progreso.'
    });
    llenarFormularioYBuscar(config).then(result => {
      console.log('[MediCenter Ext] Finalizado:', result.message);
    }).catch(err => {
      console.error('[MediCenter Ext] Error:', err.message);
    });
  } else {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    sendResponse({
      success: true,
      message: 'Navegando a Lista de trabajo V2… La descarga iniciará automáticamente.'
    });
    navegarAListaTrabajoV2().catch(err => {
      console.error('[MediCenter Ext] Error de navegación:', err.message);
      sessionStorage.removeItem(STORAGE_KEY);
    });
  }
  // No retornar true: sendResponse ya fue llamado de forma síncrona.
});

console.log('[MediCenter Ext] Content script cargado y listo.');
