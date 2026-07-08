# Electron TPV Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empaquetar el TPV como aplicación nativa Windows — Electron shell remoto que carga `https://{domain}/tpv`, con Service Worker para /tpv, impresión térmica ESC/POS (RD 1619/2012) y auto-update via electron-updater.

**Architecture:** Electron main process carga `https://{domain}/tpv` en un BrowserWindow con `contextIsolation: true`. En primera ejecución muestra `setup.html` (HTML vanilla) para configurar dominio e impresora, que se persisten en `electron-store`. El renderer accede a la impresora vía `contextBridge` IPC. Un Service Worker independiente (`sw-tpv.js`) cachea el shell de `/tpv` para resistir microcortes de red.

**Tech Stack:** Electron 31, electron-store 8, electron-updater 6, electron-builder 24 (NSIS), node-thermal-printer 4, TypeScript (CommonJS target para Electron), Next.js 16 (rutas nuevas para SW y YAML endpoint).

**IMPORTANTE — `"type": "module"` en raíz:** El `package.json` raíz tiene `"type": "module"`. Electron main process necesita CommonJS. La solución es `electron/package.json` con `"type": "commonjs"` que sobreescribe el scope para ese directorio.

---

## File Map

### Crear
| Archivo | Responsabilidad |
|---------|----------------|
| `electron/package.json` | `"type": "commonjs"` — scope override para el proceso main |
| `electron/tsconfig.json` | Compilación TypeScript → CommonJS, outDir dist |
| `electron/main.ts` | BrowserWindow, IPC handlers, shortcuts, auto-updater |
| `electron/preload.ts` | contextBridge: isElectron, getPrinters, print, saveConfig |
| `electron/setup.html` | UI primera ejecución (HTML/CSS vanilla) |
| `electron/setup.js` | Lógica setup: usa window.electronAPI para listar impresoras y guardar config |
| `electron/printer/receipt.ts` | ReceiptData interface + función buildAndPrint (plantilla ESC/POS) |
| `electron/printer/index.ts` | listPrinters() + printReceipt() — abstracción sobre node-thermal-printer |
| `electron-builder.yml` | Packaging Windows NSIS |
| `public/sw-tpv.js` | Service Worker scope /tpv (CacheFirst static, NetworkFirst /tpv/*, NetworkOnly /api/*) |
| `public/tpv-offline.html` | Fallback HTML estático pre-cacheado por el SW |
| `src/components/tpv-sw-registrar.tsx` | Client component que registra sw-tpv.js en producción |
| `src/app/tpv/offline/page.tsx` | Página offline /tpv/offline (force-static, misma estética que waiter) |
| `src/app/api/app/version/latest.yml/route.ts` | Manifiesto YAML para electron-updater (separado del endpoint APK) |

### Modificar
| Archivo | Cambio |
|---------|--------|
| `package.json` | Añadir scripts build:electron* y dev:electron; añadir deps Electron |
| `src/app/tpv/layout.tsx` | Añadir `<TpvSwRegistrar />` dentro del return |

---

## Task 1: Dependencias, scripts, electron/package.json y electron/tsconfig.json

**Files:**
- Modify: `package.json`
- Create: `electron/package.json`
- Create: `electron/tsconfig.json`

- [ ] **Step 1: Instalar dependencias Electron**

```bash
pnpm add -D electron@^31.0.0 electron-builder@^24.0.0 electron-rebuild@^3.2.9 "@electron/typescript-definitions@^8.0.0"
pnpm add electron-store@^8.1.0 electron-updater@^6.1.0 node-thermal-printer@^4.3.0
```

- [ ] **Step 2: Añadir scripts a `package.json`**

En la sección `"scripts"` de `package.json`, añadir estas 5 entradas junto a las existentes:

```json
"start:electron": "electron electron/dist/main.js",
"build:electron:prep": "tsc -p electron/tsconfig.json",
"build:electron:rebuild": "electron-rebuild",
"build:electron": "pnpm build:electron:prep && pnpm build:electron:rebuild && electron-builder --win",
"dev:electron": "cross-env NODE_ENV=development electron electron/dist/main.js"
```

- [ ] **Step 3: Crear `electron/package.json`**

El `package.json` raíz tiene `"type": "module"`. Este archivo sobreescribe ese scope para el directorio `electron/` (y sus subdirectorios), haciendo que los `.js` compilados funcionen como CommonJS en Node.js/Electron:

```json
{
  "type": "commonjs"
}
```

- [ ] **Step 4: Crear `electron/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "electron"]
  },
  "include": ["main.ts", "preload.ts", "printer/**/*.ts"],
  "exclude": ["dist"]
}
```

`rootDir: "."` equivale a `electron/`. La salida se genera en `electron/dist/`:
- `electron/main.ts` → `electron/dist/main.js`
- `electron/preload.ts` → `electron/dist/preload.js`
- `electron/printer/receipt.ts` → `electron/dist/printer/receipt.js`

- [ ] **Step 5: Verificar compilación vacía**

```bash
mkdir -p electron/printer && touch electron/main.ts electron/preload.ts electron/printer/receipt.ts electron/printer/index.ts
pnpm build:electron:prep
```

Expected: `electron/dist/` generado sin errores de compilación.

- [ ] **Step 6: Commit**

```bash
git add electron/package.json electron/tsconfig.json package.json
git commit -m "chore(electron): setup dependencias, scripts y tsconfig"
```

---

## Task 2: electron/preload.ts — contextBridge IPC bridge

**Files:**
- Create: `electron/preload.ts`

El preload es el único código que puede llamar `ipcRenderer`. Expone una API tipada al renderer via `contextBridge`. Incluye `saveConfig` para que `setup.html` pueda guardar la config sin `nodeIntegration`.

- [ ] **Step 1: Crear `electron/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { ReceiptData } from './printer/receipt';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,
  getPrinters: (): Promise<string[]> =>
    ipcRenderer.invoke('printer:list'),
  print: (data: ReceiptData): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('printer:print', data),
  saveConfig: (data: { domain: string; printerName: string }): Promise<void> =>
    ipcRenderer.invoke('store:set', data),
});
```

- [ ] **Step 2: Compilar para verificar tipos**

```bash
pnpm build:electron:prep
```

Expected: `electron/dist/preload.js` generado sin errores (la importación de `ReceiptData` es solo tipo, no genera código JS).

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(electron): preload contextBridge — isElectron, getPrinters, print, saveConfig"
```

---

## Task 3: electron/printer/receipt.ts — ReceiptData + plantilla ESC/POS

**Files:**
- Create: `electron/printer/receipt.ts`

Define el contrato de datos y construye la secuencia de comandos ESC/POS en el objeto `ThermalPrinter`. Las 8 secciones son obligatorias por RD 1619/2012.

- [ ] **Step 1: Crear `electron/printer/receipt.ts`**

```typescript
import type { ThermalPrinter } from 'node-thermal-printer';

export interface ReceiptData {
  empresa: {
    nombre: string;
    nif: string;
    direccion: string;
  };
  ticket: {
    serie: string;        // ej: "T-000042"
    fecha: string;        // ISO 8601, zona Europe/Madrid
    operador: string;
  };
  items: Array<{
    nombre: string;
    cantidad: number;
    precioUnitarioCents: number;
    subtotalCents: number;
  }>;
  totales: {
    baseImponibleCents: number;
    tipoImpuesto: 'iva' | 'igic';
    porcentajeImpuesto: number;
    impuestoCents: number;
    totalCents: number;
  };
  aeatUrl: string;
  esCobro: boolean;
  rectificaNumero?: string;
}

function centsToEur(cents: number): string {
  return (cents / 100).toFixed(2);
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padStart(str: string, len: number): string {
  return str.length >= len ? str.slice(-len) : ' '.repeat(len - str.length) + str;
}

// Ancho estándar 48 caracteres para papel 80mm
const LINE_WIDTH = 48;

export async function buildAndPrint(
  printer: ThermalPrinter,
  data: ReceiptData,
): Promise<void> {
  // 1. Cabecera
  printer.alignCenter();
  printer.bold(true);
  printer.println(data.empresa.nombre);
  printer.bold(false);
  printer.println(`NIF: ${data.empresa.nif}`);
  printer.println(data.empresa.direccion);

  const fecha = new Date(data.ticket.fecha).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  printer.println(fecha);

  if (!data.esCobro && data.rectificaNumero) {
    printer.println(`RECTIFICATIVO de ${data.rectificaNumero}`);
  }

  // 2. Separador
  printer.drawLine();

  // 3. Items
  printer.alignLeft();
  for (const item of data.items) {
    const precio = `${item.cantidad}x${centsToEur(item.precioUnitarioCents)}`;
    const sub = centsToEur(item.subtotalCents);
    const leftWidth = LINE_WIDTH - precio.length - sub.length - 2;
    const left = padEnd(item.nombre, leftWidth);
    printer.println(`${left} ${precio} ${padStart(sub, sub.length)}`);
  }

  // 4. Separador
  printer.drawLine();

  // 5. Totales
  printer.alignRight();
  printer.println(`Base imponible: ${centsToEur(data.totales.baseImponibleCents)} EUR`);
  printer.println(
    `${data.totales.tipoImpuesto.toUpperCase()} (${data.totales.porcentajeImpuesto}%): ${centsToEur(data.totales.impuestoCents)} EUR`,
  );
  printer.bold(true);
  printer.println(`TOTAL: ${centsToEur(data.totales.totalCents)} EUR`);
  printer.bold(false);

  // 6. QR code verificación AEAT
  printer.alignCenter();
  await printer.printQR(data.aeatUrl, {
    cellSize: 3,
    correction: 'M',
    model: 2,
  });
  printer.println(data.aeatUrl);

  // 7. Pie: número de ticket + texto legal
  printer.println('');
  printer.println(data.ticket.serie);
  printer.println(`Operador: ${data.ticket.operador}`);
  printer.println('Conserve este ticket. IVA incluido RD 1619/2012');

  // 8. Cut + avance de papel
  printer.cut();

  await printer.execute();
}
```

- [ ] **Step 2: Compilar**

```bash
pnpm build:electron:prep
```

Expected: `electron/dist/printer/receipt.js` sin errores.

- [ ] **Step 3: Commit**

```bash
git add electron/printer/receipt.ts
git commit -m "feat(electron): ReceiptData interface + plantilla ESC/POS (RD 1619/2012)"
```

---

## Task 4: electron/printer/index.ts — abstracción de impresora

**Files:**
- Create: `electron/printer/index.ts`

Expone `listPrinters` (usa la API de Electron para listar impresoras del sistema Windows) y `printReceipt` (instancia `ThermalPrinter` con el nombre guardado).

- [ ] **Step 1: Crear `electron/printer/index.ts`**

```typescript
import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';
import type { BrowserWindow } from 'electron';
import type { ReceiptData } from './receipt';
import { buildAndPrint } from './receipt';

export async function listPrinters(win: BrowserWindow): Promise<string[]> {
  // getPrintersAsync() devuelve las impresoras instaladas en Windows
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => p.name);
}

export async function printReceipt(
  printerName: string,
  data: ReceiptData,
): Promise<{ success: boolean; error?: string }> {
  try {
    // InterfaceType PRINTER usa el nombre de impresora Windows (USB, red, etc.)
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `printer:${printerName}`,
      characterSet: CharacterSet.PC858_EURO,
      breakLine: BreakLine.WORD,
      removeSpecialCharacters: false,
      lineCharacter: '-',
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { success: false, error: 'Impresora no disponible' };
    }

    await buildAndPrint(printer, data);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}
```

- [ ] **Step 2: Compilar**

```bash
pnpm build:electron:prep
```

Expected: `electron/dist/printer/index.js` sin errores.

- [ ] **Step 3: Commit**

```bash
git add electron/printer/index.ts
git commit -m "feat(electron): abstracción impresora — listPrinters + printReceipt"
```

---

## Task 5: electron/setup.html + electron/setup.js — UI primera ejecución

**Files:**
- Create: `electron/setup.html`
- Create: `electron/setup.js`

Setup.js usa `window.electronAPI` (expuesto por preload via contextBridge), NO `require('electron')`, porque `nodeIntegration: false`.

- [ ] **Step 1: Crear `electron/setup.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Configuración TPV MultiShop</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e8eaf0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1a1d27;
      border: 1px solid #2a2d3d;
      border-radius: 12px;
      padding: 40px;
      width: 440px;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #6b7280; margin-bottom: 32px; }
    label { display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px; }
    input, select {
      width: 100%;
      padding: 10px 14px;
      background: #0f1117;
      border: 1px solid #2a2d3d;
      border-radius: 8px;
      color: #e8eaf0;
      font-size: 14px;
      margin-bottom: 20px;
      outline: none;
    }
    input:focus, select:focus { border-color: #4f6ef7; }
    button {
      width: 100%;
      padding: 12px;
      background: #4f6ef7;
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #3a5be0; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: #ef4444; font-size: 13px; margin-top: 12px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Configuración inicial</h1>
    <p class="subtitle">
      Introduce el dominio de tu cuenta MultiShop y selecciona la impresora térmica.
    </p>

    <label for="domain">Dominio (sin https://)</label>
    <input
      type="text"
      id="domain"
      placeholder="mi-restaurante.multishop.es"
      autocomplete="off"
      spellcheck="false"
    />

    <label for="printer">Impresora térmica</label>
    <select id="printer">
      <option value="">Cargando impresoras…</option>
    </select>

    <button id="save" disabled>Guardar y acceder</button>
    <p class="error" id="error"></p>
  </div>
  <script src="setup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Crear `electron/setup.js`**

```javascript
// setup.js — corre en el renderer de setup.html como script clásico de navegador.
// Usa window.electronAPI expuesto por contextBridge (preload.ts). NO usar require().

const domainInput = document.getElementById('domain');
const printerSelect = document.getElementById('printer');
const saveBtn = document.getElementById('save');
const errorEl = document.getElementById('error');

function updateSaveBtn() {
  saveBtn.disabled = !domainInput.value.trim() || !printerSelect.value;
}

// Cargar lista de impresoras
window.electronAPI.getPrinters().then((printers) => {
  if (printers.length === 0) {
    printerSelect.innerHTML = '<option value="">Sin impresoras detectadas</option>';
  } else {
    printerSelect.innerHTML = printers
      .map((p) => `<option value="${p}">${p}</option>`)
      .join('');
    updateSaveBtn();
  }
}).catch(() => {
  printerSelect.innerHTML = '<option value="">Error al cargar impresoras</option>';
});

domainInput.addEventListener('input', updateSaveBtn);
printerSelect.addEventListener('change', updateSaveBtn);

saveBtn.addEventListener('click', () => {
  const domain = domainInput.value.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const printerName = printerSelect.value;

  if (!domain || !printerName) return;

  saveBtn.disabled = true;
  errorEl.style.display = 'none';

  window.electronAPI.saveConfig({ domain, printerName }).catch((err) => {
    errorEl.textContent = (err && err.message) ? err.message : 'Error al guardar la configuración';
    errorEl.style.display = 'block';
    saveBtn.disabled = false;
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/setup.html electron/setup.js
git commit -m "feat(electron): setup UI primera ejecución — domain + impresora"
```

---

## Task 6: electron/main.ts — Main process

**Files:**
- Create: `electron/main.ts`

Núcleo del proceso principal: BrowserWindow, IPC handlers, bloqueo de shortcuts, Ctrl+Shift+R reset, y auto-updater.

- [ ] **Step 1: Crear `electron/main.ts`**

```typescript
import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { listPrinters, printReceipt } from './printer/index';
import type { ReceiptData } from './printer/receipt';

interface StoreSchema {
  domain: string;
  printerName: string;
}

const store = new Store<StoreSchema>();
let mainWindow: BrowserWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: true,
    kiosk: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const domain = store.get('domain');
  if (!domain) {
    void mainWindow.loadFile(path.join(__dirname, '../setup.html'));
  } else {
    void mainWindow.loadURL(`https://${domain}/tpv`);
  }

  blockDangerousShortcuts();
}

function blockDangerousShortcuts(): void {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const blocked: Array<{ key: string; control?: boolean; shift?: boolean }> = [
      { key: 'F5' },
      { key: 'r', control: true },
      { key: '=', control: true },
      { key: '-', control: true },
      { key: '0', control: true },
      { key: 'F11' },
    ];

    // DevTools solo bloqueados en producción
    if (app.isPackaged) {
      blocked.push({ key: 'I', control: true, shift: true });
      blocked.push({ key: 'F12' });
    }

    const isBlocked = blocked.some(
      (b) =>
        input.key === b.key &&
        (b.control === undefined || input.control === b.control) &&
        (b.shift === undefined || input.shift === b.shift),
    );

    if (isBlocked) event.preventDefault();
  });
}

function registerGlobalShortcuts(): void {
  // Único shortcut activo en producción: reset de configuración
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    store.clear();
    void mainWindow.loadFile(path.join(__dirname, '../setup.html'));
  });
}

function setupIpc(): void {
  ipcMain.handle('store:set', (_event, data: { domain: string; printerName: string }) => {
    store.set('domain', data.domain);
    store.set('printerName', data.printerName);
    void mainWindow.loadURL(`https://${data.domain}/tpv`);
  });

  ipcMain.handle('printer:list', async () => {
    return listPrinters(mainWindow);
  });

  ipcMain.handle('printer:print', async (_event, data: ReceiptData) => {
    const printerName = store.get('printerName');
    if (!printerName) {
      return { success: false, error: 'Impresora no configurada' };
    }
    return printReceipt(printerName, data);
  });
}

function setupAutoUpdater(): void {
  const domain = store.get('domain');
  if (!domain) return;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://${domain}/api/app/version/`,
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Silencioso — no crashear si no hay red o no hay nueva versión
  });
}

app.whenReady().then(() => {
  createWindow();
  registerGlobalShortcuts();
  setupIpc();
  setupAutoUpdater();
}).catch(console.error);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 2: Compilar**

```bash
pnpm build:electron:prep
```

Expected: `electron/dist/main.js` sin errores de tipos.

- [ ] **Step 3: Arrancar en desarrollo para smoke test rápido**

```bash
pnpm dev:electron
```

Expected: Ventana abre mostrando `setup.html` (dominio vacío en electron-store).

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(electron): main process — BrowserWindow, IPC, shortcuts, auto-updater"
```

---

## Task 7: electron-builder.yml — packaging Windows NSIS

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Verificar si existe `public/icon.ico`**

```bash
ls public/*.ico 2>/dev/null && echo "icon exists" || echo "icon missing"
```

Si no existe, omitir el campo `icon` en el YAML del siguiente paso (no bloquea el build, usa icono genérico de Electron).

- [ ] **Step 2: Crear `electron-builder.yml`**

```yaml
appId: com.multishop.tpv
productName: TPV MultiShop
directories:
  output: dist/
files:
  - electron/dist/**
  - electron/setup.html
  - electron/setup.js
  - electron/package.json
  - package.json
# NO incluir .next/ ni node_modules/ raíz — el TPV corre en la nube, no localmente
extraMetadata:
  main: electron/dist/main.js
win:
  target: nsis
  icon: public/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
publish:
  provider: generic
  url: https://app.multishop.es/api/app/version/
```

Si `public/icon.ico` no existe, eliminar la línea `icon: public/icon.ico` del YAML.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "feat(electron): electron-builder.yml — NSIS Windows packaging"
```

---

## Task 8: Service Worker /tpv + fallback offline HTML

**Files:**
- Create: `public/sw-tpv.js`
- Create: `public/tpv-offline.html`

Mismo patrón que `public/sw-kitchen.js`. Usar `globalThis.*` (SonarLint S7764 — no usar `self.*`).

- [ ] **Step 1: Crear `public/sw-tpv.js`**

```javascript
const CACHE_NAME = 'tpv-v1';
const OFFLINE_URL = '/tpv/offline';

// Pre-cachear la página offline durante la instalación
globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  globalThis.skipWaiting();
});

// Limpiar caches antiguos al activar
globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  globalThis.clients.claim();
});

globalThis.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptar GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // NetworkOnly para /api/* — auth y datos siempre frescos
  if (url.pathname.startsWith('/api/')) return;

  // CacheFirst para /_next/static/* — chunks content-hashed, eternos
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // NetworkFirst para /tpv/* — con fallback a página offline
  if (url.pathname.startsWith('/tpv')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(OFFLINE_URL).then(
            (cached) => cached ?? new Response('Sin conexión', { status: 503 })
          )
        )
    );
  }
});
```

- [ ] **Step 2: Crear `public/tpv-offline.html`**

Fallback HTML estático adicional (sin depender de Next.js), por si la página offline no puede pre-cachearse:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TPV — Sin conexión</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e8eaf0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    .icon {
      width: 64px; height: 64px;
      margin: 0 auto 24px;
      background: #1a1d27;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: #6b7280; max-width: 280px; margin: 0 auto 24px; }
    button {
      padding: 10px 20px;
      background: #1a1d27;
      border: 1px solid #2a2d3d;
      border-radius: 8px;
      color: #e8eaf0;
      font-size: 14px;
      cursor: pointer;
    }
    button:hover { background: #2a2d3d; }
  </style>
</head>
<body>
  <div>
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
           fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    </div>
    <h1>Sin conexión</h1>
    <p>El TPV se reconectará automáticamente cuando vuelva la señal.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add public/sw-tpv.js public/tpv-offline.html
git commit -m "feat(tpv): Service Worker sw-tpv.js + fallback tpv-offline.html"
```

---

## Task 9: src/app/tpv/offline/page.tsx + src/components/tpv-sw-registrar.tsx

**Files:**
- Create: `src/app/tpv/offline/page.tsx`
- Create: `src/components/tpv-sw-registrar.tsx`

Misma estética que `src/app/waiter/offline/page.tsx`. El registrar solo actúa en producción.

- [ ] **Step 1: Crear `src/app/tpv/offline/page.tsx`**

```tsx
'use client';

export const dynamic = 'force-static';

export default function TpvOfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center"
      style={{ background: 'oklch(13% 0.02 252)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'oklch(20% 0.04 252)' }}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(55% 0.08 252)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <div>
        <h1
          className="text-xl font-semibold mb-2"
          style={{ color: 'oklch(92% 0.02 252)' }}
        >
          Sin conexión
        </h1>
        <p
          className="text-sm max-w-xs"
          style={{ color: 'oklch(58% 0.05 252)' }}
        >
          El TPV se reconectará automáticamente cuando vuelva la señal. Comprueba
          que el equipo está conectado a la red del local.
        </p>
      </div>

      <button
        type="button"
        onClick={() => globalThis.location.reload()}
        className="mt-2 px-5 py-2.5 rounded-lg text-sm font-medium"
        style={{
          background: 'oklch(28% 0.06 252)',
          color: 'oklch(85% 0.05 252)',
          border: '1px solid oklch(35% 0.05 252)',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Crear `src/components/tpv-sw-registrar.tsx`**

```tsx
'use client';
import { useEffect } from 'react';

export function TpvSwRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw-tpv.js', { scope: '/tpv' });
  }, []);
  return null;
}
```

- [ ] **Step 3: Lint y build para verificar**

```bash
pnpm lint && pnpm build
```

Expected: Sin errores de tipos ni lint. La ruta `/tpv/offline` aparece en el output de build.

- [ ] **Step 4: Commit**

```bash
git add src/app/tpv/offline/page.tsx src/components/tpv-sw-registrar.tsx
git commit -m "feat(tpv): página offline + TpvSwRegistrar component"
```

---

## Task 10: Modificar src/app/tpv/layout.tsx — añadir TpvSwRegistrar

**Files:**
- Modify: `src/app/tpv/layout.tsx`

`TpvSwRegistrar` es un client component que devuelve `null`. Se puede añadir dentro de cualquier server component sin necesidad de marcar el layout como client.

- [ ] **Step 1: Añadir import en `src/app/tpv/layout.tsx`**

Añadir después de la última línea de imports (línea 6, después de `import type { RolAdmin }`):

```typescript
import { TpvSwRegistrar } from '@/components/tpv-sw-registrar';
```

- [ ] **Step 2: Añadir `<TpvSwRegistrar />` en el return**

Dentro del bloque `return`, añadir `<TpvSwRegistrar />` después de la apertura de `<TpvRolProvider>` (línea 25). El componente devuelve null, por lo que puede ir en cualquier posición dentro del return:

```tsx
return (
  <TpvRolProvider rol={admin.rol}>
    <TpvSwRegistrar />
    <div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">
      <TpvHeader empresaNombre={admin.empresa?.nombre ?? ''} />
      <main className="flex flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  </TpvRolProvider>
);
```

- [ ] **Step 3: Lint y build**

```bash
pnpm lint && pnpm build
```

Expected: Sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/tpv/layout.tsx
git commit -m "feat(tpv): registrar Service Worker sw-tpv.js en layout"
```

---

## Task 11: src/app/api/app/version/latest.yml/route.ts — YAML endpoint para electron-updater

**Files:**
- Create: `src/app/api/app/version/latest.yml/route.ts`

El endpoint existente `GET /api/app/version` devuelve JSON para el APK Android. Este es un endpoint NUEVO y separado que devuelve YAML para `electron-updater` con `provider: generic`.

El `sha512` se genera durante el build con `electron-builder` y se configura como variable de entorno.

- [ ] **Step 1: Crear `src/app/api/app/version/latest.yml/route.ts`**

```typescript
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const version = process.env.ELECTRON_VERSION ?? '1.0.0';
  const sha512 = process.env.ELECTRON_SHA512 ?? '';
  const releaseDate =
    process.env.ELECTRON_RELEASE_DATE ?? new Date().toISOString();

  const yaml = [
    `version: ${version}`,
    `path: tpv-setup-${version}.exe`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
  ].join('\n');

  return new NextResponse(yaml, {
    headers: {
      'Content-Type': 'application/yaml',
      'Cache-Control': 'no-store',
    },
  });
}
```

Variables de entorno a configurar en Vercel tras el primer build:
- `ELECTRON_VERSION` — versión del instalador (ej: `1.0.0`)
- `ELECTRON_SHA512` — hash base64 SHA-512 del `.exe`, generado por `electron-builder` en `dist/latest.yml`
- `ELECTRON_RELEASE_DATE` — fecha ISO del release (ej: `2026-07-07T12:00:00.000Z`)

- [ ] **Step 2: Lint y build**

```bash
pnpm lint && pnpm build
```

Expected: Sin errores. La ruta `/api/app/version/latest.yml` aparece en el output de build.

- [ ] **Step 3: Verificar respuesta manualmente**

```bash
pnpm start
curl http://localhost:3000/api/app/version/latest.yml
```

Expected output:
```
version: 1.0.0
path: tpv-setup-1.0.0.exe
sha512:
releaseDate: '2026-07-07T...'
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/app/version/latest.yml/route.ts
git commit -m "feat(api): endpoint YAML latest.yml para electron-updater"
```

---

## Task 12: Smoke test Electron + commit final de rama

**Files:** ninguno nuevo (verificación)

- [ ] **Step 1: Compilar proceso Electron**

```bash
pnpm build:electron:prep
```

Expected: `electron/dist/` con `main.js`, `preload.js`, `printer/receipt.js`, `printer/index.js`. Sin errores de TypeScript.

- [ ] **Step 2: Smoke test — Primera ejecución**

```bash
pnpm dev:electron
```

Verificar manualmente:
- [ ] Ventana abre con `setup.html` (campo dominio vacío, lista de impresoras cargada)
- [ ] Introducir un dominio válido, seleccionar una impresora, pulsar "Guardar y acceder"
- [ ] Ventana navega a `https://{domain}/tpv`

- [ ] **Step 3: Smoke test — Segunda ejecución**

Cerrar y reabrir:
```bash
pnpm dev:electron
```

Verificar:
- [ ] Carga directamente `https://{domain}/tpv` sin mostrar setup
- [ ] `Ctrl+R` y `F5` NO recargan la página
- [ ] `Ctrl+Shift+R` vuelve a `setup.html` y limpia la config

- [ ] **Step 4: Smoke test SW (requiere `pnpm build && pnpm start`)**

Con el servidor Next.js corriendo en producción:
- [ ] Abrir DevTools → Application → Service Workers → verificar `sw-tpv.js` registrado con scope `/tpv`
- [ ] En DevTools → Network → activar "Offline" → navegar dentro de `/tpv` → debe aparecer la página offline, no pantalla en blanco

- [ ] **Step 5: Verificar `electron-rebuild` (requerido antes del `electron-builder` final)**

```bash
pnpm build:electron:rebuild
```

Expected: Módulos nativos de `node-thermal-printer` recompilados para la versión de Chromium/Node embebida en Electron 31. Sin errores de binding.

- [ ] **Step 6: Merge a develop**

Una vez todos los smoke tests pasan:

```bash
git checkout develop
git merge fix/pre-release-qa-bugs --no-ff
git push origin develop
```

---

## Self-Review — Cobertura del spec

| Sección spec | Tarea |
|---|---|
| Shell remoto BrowserWindow | Task 6 (main.ts) |
| electron-store setup flow | Task 5 + Task 6 (store:set IPC) |
| Ctrl+Shift+R reset | Task 6 (globalShortcut) |
| Bloqueo F5/Ctrl+R/F11/DevTools | Task 6 (before-input-event) |
| contextBridge preload | Task 2 |
| ReceiptData interface | Task 3 |
| Plantilla ESC/POS 8 secciones | Task 3 (buildAndPrint) |
| printer:list IPC | Task 4 + Task 6 |
| printer:print IPC | Task 4 + Task 6 |
| Service Worker sw-tpv.js | Task 8 |
| CacheFirst /_next/static/* | Task 8 |
| NetworkFirst /tpv/* + fallback offline | Task 8 |
| NetworkOnly /api/* | Task 8 |
| TpvSwRegistrar component | Task 9 |
| /tpv/offline page | Task 9 |
| layout.tsx + TpvSwRegistrar | Task 10 |
| electron-builder.yml | Task 7 |
| latest.yml YAML endpoint | Task 11 |
| electron/package.json "type": "commonjs" | Task 1 |
| electron-rebuild en build script | Task 1 |
