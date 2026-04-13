# MediCenter Report Extractor — Extensión Chrome

## Instalación

1. Abre `chrome://extensions/` en Chrome
2. Activa **Modo desarrollador** (esquina superior derecha)
3. Clic en **Cargar extensión sin empaquetar**
4. Selecciona esta carpeta (`medicenter-report-ext/`)
5. Navega a `https://his.medicenter.cl/` e inicia sesión
6. Haz clic en el ícono de la extensión → **Generar y Descargar Reporte**

## Estructura del proyecto

```
medicenter-report-ext/
├── manifest.json    → Configuración Manifest V3
├── popup.html       → Interfaz del popup (fechas + botón)
├── popup.js         → Lógica del popup (mensajería)
├── content.js       → Automatización en el DOM del portal
├── icons/           → Íconos de la extensión (reemplazar)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md        → Este archivo
```

## ¿Qué editar?

### 1. Selectores CSS (`content.js` → objeto `SELECTORS`)

Abre el Inspector (F12) en el portal HIS MediCenter y busca los `id`, `name` o
`class` de cada elemento del formulario. Luego reemplaza los valores placeholder.

| Constante       | Qué buscar                               | Ejemplo real          |
|-----------------|------------------------------------------|-----------------------|
| `SUCURSAL`      | `<select>` de sucursal                   | `#suc_Id`             |
| `FECHA`         | `<input>` del daterangepicker            | `input[name="daterange"]` |
| `SERVICIO`      | `<select>` de tipo de servicio           | `#ser_id`             |
| `PROFESIONAL`   | `<select>` de profesional                | `#pro_id`             |
| `SALA`          | `<select>` de sala                       | `#sala_id`            |
| `BTN_BUSCAR`    | Botón que ejecuta la búsqueda            | `button.btn-search`   |
| `BTN_EXCEL`     | Botón/enlace "Excel" post-búsqueda       | `a.buttons-excel`     |

### 2. Valores por defecto (`content.js` → objeto `DEFAULT_VALUES`)

Cada `<option>` dentro de un `<select>` tiene un atributo `value`. Inspecciona
los selects para encontrar los values que corresponden a tus opciones deseadas.

### 3. Formato de fecha

Si el daterangepicker del portal usa un formato distinto a `DD/MM/YYYY`, edita
la función `formatDate()` en `content.js`.

## Troubleshooting

- **"Botón no encontrado"**: El selector CSS es incorrecto. Usa F12 → Inspector
  para verificar.
- **"Timeout: elemento no apareció"**: La tabla tarda demasiado o el selector del
  botón Excel cambió. Aumenta el timeout en `waitForElement()` o verifica el
  selector.
- **Los selects no cambian**: Algunos portales usan Select2 o selectpicker. En
  ese caso, además de cambiar `.value`, hay que disparar eventos específicos del
  plugin (ver comentarios en `setSelectValue()`).
