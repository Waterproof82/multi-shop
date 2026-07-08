# Electron TPV Windows — Design Spec

> Fase A del packaging nativo de escritorio. Shell remoto Electron que apunta a `https://{domain}/tpv`.
> Incluye: setup multi-tenant, Service Worker para /tpv, impresión térmica (RD 1619/2012).

---

## Contexto y decisiones clave

**Opción elegida: Shell remoto (Opción A)**
Electron es un contenedor Chromium que carga `https://{domain}/tpv`. El frontend Next.js y el backend Supabase corren en la nube. No se bundlea código de servidor en el instalador.

**Coherencia con Capacitor Android**
Mismo principio que `com.multishop.waiter`: shell nativo + configuración de dominio en primera ejecución + redirect a la URL remota del tenant. Un solo codebase web, múltiples contenedores nativos.

**Resiliencia offline**
No es offline total (requiere Supabase). Se mitiga con:
- Service Worker `/tpv` — shell y chunks cacheados, resiste microcortes
- Recomendación de hardware: ethernet directo + 4G failover

**Impresión térmica**
Obligatoria por RD 1619/2012. Se implementa en el Main Process via `node-thermal-printer`, expuesta al renderer via `contextBridge`.

---

## Arquitectura

```
┌────────────────────────────────────────────────────┐
│                  Windows Machine                   │
│                                                    │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Main Process │    │   BrowserWindow (WebView)│  │
│  │  main.ts     │◄──►│   https://{domain}/tpv   │  │
│  │  IPC         │    │                          │  │
│  │  electron-   │    │  ┌────────────────────┐  │  │
│  │  store       │    │  │  Service Worker    │  │  │
│  │  updater     │    │  │  sw-tpv.js         │  │  │
│  │  printer     │    │  │  scope: /tpv       │  │  │
│  └──────┬───────┘    │  └────────────────────┘  │  │
│         │ preload.ts │                          │  │
│         └───────────►│  window.electronAPI      │  │
│                      │    .print()              │  │
│                      │    .getPrinters()        │  │
│                      │    .isElectron           │  │
│                      └──────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────┐                  │
│  │  Impresora Térmica           │                  │
│  │  (USB / COM / TCP)           │◄── IPC printer:* │
│  └──────────────────────────────┘                  │
└────────────────────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   Supabase Cloud      │
              │   Next.js en Vercel   │
              └───────────────────────┘
```

---

## Estructura de archivos

```
electron/
  main.ts              — BrowserWindow, IPC handlers, auto-update, shortcuts
  preload.ts           — contextBridge: print, getPrinters, isElectron
  setup.html           — UI primera ejecución (HTML vanilla, sin React)
  setup.js             — lógica setup: guarda domain + printer en electron-store
  tsconfig.json        — tsconfig del proceso Electron (target: ES2020, module: commonjs)
  printer/
    receipt.ts         — plantilla ESC/POS: cabecera, items, totales, QR AEAT
    index.ts           — abstracción: detecta USB/COM/TCP, llama node-thermal-printer

public/
  sw-tpv.js            — Service Worker scope /tpv (nuevo)
  tpv-offline.html     — fallback offline estático para /tpv (pre-cacheado por SW)

src/
  components/
    tpv-sw-registrar.tsx     — registra sw-tpv.js en producción (nuevo)
  app/tpv/
    layout.tsx               — añadir <TpvSwRegistrar /> (modificar)
    offline/
      page.tsx               — página offline /tpv/offline (nueva, force-static)

  app/api/app/version/
    route.ts                 — endpoint JSON existente (APK Android, no modificar)
    latest.yml/
      route.ts               — NUEVO: manifiesto YAML para electron-updater

electron-builder.yml         — config packaging Windows (nuevo)
package.json                 — añadir scripts build:electron, start:electron (modificar)
```

---

## Setup flow — primera ejecución

```
1. main.ts arranca → lee electron-store → no hay domain
2. Abre BrowserWindow cargando electron/setup.html (archivo local)
3. Usuario ingresa domain (ej: mi-restaurante.com)
4. Usuario selecciona impresora de la lista (ipcRenderer.invoke('printer:list'))
5. ipcRenderer.invoke('store:set', { domain, printerName })
6. main.ts guarda en electron-store → cierra setup → carga https://{domain}/tpv
```

```
Ejecuciones siguientes:
1. main.ts → lee electron-store → domain existe
2. Carga directamente https://{domain}/tpv
3. Next.js middleware verifica admin_token cookie → si expiró, redirige a /admin/login
```

**Reset de configuración:** `Ctrl+Shift+R` → borra electron-store → vuelve a setup.html.

---

## Ventana principal

```typescript
// main.ts — BrowserWindow config
new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 1024,
  minHeight: 768,
  frame: true,              // frame nativo de Windows
  kiosk: false,             // activable por config para modo quiosco
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false, // seguridad: no exponer Node.js al renderer
    sandbox: false,         // requerido para preload con ipcRenderer
  },
});
```

**Atajos de teclado bloqueados en `main.ts`:**
- `F5`, `Ctrl+R` — recarga (peligrosa en medio de un cobro)
- `Ctrl+=`, `Ctrl+-`, `Ctrl+0` — zoom
- `F11` — fullscreen nativo
- `Ctrl+Shift+I`, `F12` — DevTools (solo en dev)

Se bloquean via `webContents.on('before-input-event')` y `globalShortcut`.

**Único shortcut activo en producción:** `Ctrl+Shift+R` → reset electron-store → setup.

---

## Service Worker para `/tpv`

`public/sw-tpv.js` — misma lógica que `public/sw.js` con:
- `const CACHE_NAME = 'tpv-v1'`
- Scope fijado en el registro, no en el archivo

Estrategias:
```
/_next/static/*  → CacheFirst        (chunks content-hashed, eternos)
/tpv/*           → NetworkFirst      (HTML shell, bell.mp3 equivalente)
                    fallback: /tpv/offline
/api/*           → NetworkOnly       (auth y datos siempre frescos)
GET only         → non-GET ignorados
```

`TpvSwRegistrar` — componente client:
```typescript
// src/components/tpv-sw-registrar.tsx
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

Montado en `src/app/tpv/layout.tsx` junto al resto de providers.

`src/app/tpv/offline/page.tsx` — `export const dynamic = 'force-static'`. Pre-cacheado en el evento `install` del SW. Mismo diseño que `waiter/offline/page.tsx`.

---

## Impresión térmica

### IPC API (preload.ts → main.ts)

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  print: (data: ReceiptData) => ipcRenderer.invoke('printer:print', data),
});
```

### ReceiptData (contrato)

```typescript
interface ReceiptData {
  empresa: {
    nombre: string;
    nif: string;
    direccion: string;
  };
  ticket: {
    serie: string;       // ej: "T-000042"
    fecha: string;       // ISO 8601, zona Europe/Madrid
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
  aeatUrl: string;       // URL verificación AEAT (ya implementada en CobroConfirmado)
  esCobro: boolean;      // false = rectificativo
  rectificaNumero?: string;
}
```

### Plantilla ESC/POS (`electron/printer/receipt.ts`)

Secciones en orden:
1. **Cabecera**: nombre empresa (bold, centrado), NIF, dirección, fecha/hora
2. **Separador**
3. **Items**: nombre · qty × precio · subtotal (alineado a columnas)
4. **Separador**
5. **Totales**: base imponible, IVA/IGIC (%), total (bold)
6. **QR code**: URL verificación AEAT (campo obligatorio pendiente en legal compliance)
7. **Pie**: número de ticket `T-NNNNNN`, texto legal mínimo
8. **Cut** + avance de papel

### Integración en el renderer

```typescript
// En CobroConfirmado o CobrarButton component
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      print: (data: ReceiptData) => Promise<void>;
      getPrinters: () => Promise<string[]>;
    };
  }
}

// Al confirmar cobro:
if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
  await window.electronAPI.print(receiptData);
}
```

La impresión es opcional — si `electronAPI` no existe (browser web), el flujo continúa sin imprimir.

### Configuración de impresora

Setup inicial guarda `printerName` en electron-store.
Main process la lee al arrancar. Si no hay impresora configurada o falla la conexión, el IPC devuelve `{ success: false, error: 'Impresora no disponible' }` — el renderer muestra aviso no bloqueante.

---

## Auto-update

`electron-updater` con `provider: generic` requiere un manifiesto **YAML** llamado `latest.yml`, NO JSON.

**Nuevo endpoint** `GET /api/app/version/latest.yml`:
```yaml
version: 1.0.0
path: tpv-setup-1.0.0.exe
sha512: <sha512-base64-del-exe>
releaseDate: '2026-07-07T12:00:00.000Z'
```

El endpoint existente `GET /api/app/version` (JSON para APK Android) no se modifica.

El sha512 se genera durante el build con `electron-builder` y se almacena como env var o en Supabase Storage junto al `.exe`.

---

## Build y packaging

### `electron-builder.yml`

```yaml
appId: com.multishop.tpv
productName: TPV MultiShop
directories:
  output: dist/
files:
  - electron/dist/**     # proceso principal compilado
  - electron/setup.html
  - electron/setup.js
  - package.json         # electron-builder lo necesita para metadata
# NO incluir .next/ ni node_modules raíz — Electron no ejecuta Next.js localmente
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

### Scripts en `package.json`

```json
"start:electron": "electron electron/dist/main.js",
"build:electron:prep": "tsc -p electron/tsconfig.json",
"build:electron:rebuild": "electron-rebuild",
"build:electron": "pnpm build:electron:prep && pnpm build:electron:rebuild && electron-builder --win",
"dev:electron": "NODE_ENV=development electron electron/dist/main.js"
```

`electron-rebuild` recompila módulos nativos (como `node-thermal-printer` con bindings C++) para la versión exacta de Chromium/Node.js embebida en Electron.

### Dependencias a añadir

```json
// devDependencies
"electron": "^31.0.0",
"electron-builder": "^24.0.0",
"electron-rebuild": "^3.2.9",
"@electron/typescript-definitions": "^8.0.0"

// dependencies (van al instalador)
"electron-store": "^8.1.0",
"electron-updater": "^6.1.0",
"node-thermal-printer": "^4.3.0"
```

---

## Cumplimiento legal — items cubiertos por este spec

Del documento `docs/tpv-legal-compliance.md`, este spec completa los pendientes marcados `[ ]` que dependen de impresión:

| Item | Estado tras este spec |
|------|----------------------|
| 1.4 QR verificación AEAT en ticket impreso | ✅ `receipt.ts` genera QR con `aeatUrl` |
| 3 · Fecha y hora en ticket impreso | ✅ cabecera ESC/POS |
| 3 · Desglose de ítems en ticket | ✅ sección items ESC/POS |
| 3 · Importe total con/sin IVA en ticket | ✅ sección totales ESC/POS |

---

## Criterios de éxito (smoke test Electron)

- [ ] `pnpm build:electron` genera `dist/tpv-setup-{version}.exe` sin errores
- [ ] `electron-rebuild` completa sin errores de bindings nativos
- [ ] Primera ejecución → setup screen → domain + impresora guardados → carga `/tpv`
- [ ] Segunda ejecución → salta setup, carga `/tpv` directamente
- [ ] Login admin dentro de Electron → cookie `admin_token` persiste al cerrar y reabrir
- [ ] SW `sw-tpv.js` registrado: DevTools → Application → Service Workers → scope `/tpv`
- [ ] Microcorte de red → UI no queda en blanco, SW mantiene shell
- [ ] `Ctrl+R` / `F5` no recargan la página
- [ ] `Ctrl+Shift+R` vuelve a setup screen
- [ ] DevTools no abre con `F12` ni `Ctrl+Shift+I` en producción
- [ ] Cobro confirmado → ticket impreso con ítems, totales, QR AEAT, número serie
- [ ] Cobro desde browser web (sin Electron) → flujo normal, sin llamada a print
- [ ] `GET /api/app/version/latest.yml` devuelve YAML válido con `version`, `path`, `sha512`
- [ ] Auto-update check al arrancar → no crashea aunque no haya versión nueva
- [ ] Reset config (`Ctrl+Shift+R`) → vuelve a setup screen limpio

---

## Roadmap futuro (fuera de scope de este spec)

- **Offline real (Opción B)**: Next.js embebido + SQLite local + sync Supabase. Spec independiente cuando haya tracción enterprise.
- **TicketBAI**: firma XML + envío a haciendas forales. Solo para clientes en País Vasco.
- **Cajón portamonedas**: apertura automática vía ESC/POS al cobrar en efectivo.
- **Modo quiosco**: `kiosk: true` en BrowserWindow config — un flag en electron-store lo activa.
- **Código de barras / lector**: escáner USB actúa como teclado — no requiere cambios en Electron.
