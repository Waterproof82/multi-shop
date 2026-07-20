# Fiscal Snapshot Local al Cerrar Turno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Guardar el `InformeZData` como JSON en disco local (via Electron IPC) cada vez que se cierra un turno en el TPV.

**Architecture:** `TurnoCerrarForm` ya obtiene el `InformeZData` de la API al cerrar el turno. Añadimos un IPC handler en el main process que recibe ese objeto y lo persiste en `{userData}/fiscal/{empresa-slug}/{fecha}-Z{numeroZ}.json`. La llamada es fire-and-forget — no bloquea el modal de Informe Z.

**Tech Stack:** Electron IPC (`ipcMain.handle` / `ipcRenderer.invoke`), Node.js `fs` + `path`, TypeScript global `Window` augmentation.

---

## File Map

| Acción | Archivo | Qué hace |
|--------|---------|----------|
| Create | `src/types/electron.d.ts` | Declara `Window.electronAPI` con todos sus métodos tipados |
| Modify | `electron/main.ts` | Añade handler `fiscal:save-snapshot` en `setupIpc()` |
| Modify | `electron/preload.ts` | Expone `saveFiscalSnapshot` en contextBridge |
| Modify | `src/components/tpv/TurnoCerrarForm.tsx` | Llama `saveFiscalSnapshot(data)` fire-and-forget después de obtener el informe Z |

---

## Task 1: Tipo global de `Window.electronAPI`

**Files:**
- Create: `src/types/electron.d.ts`

Este archivo añade `electronAPI` al tipo `Window` de TypeScript. Sin él, cualquier referencia a `window.electronAPI` en el frontend es un error de tipo.

- [x] **Step 1: Crear `src/types/electron.d.ts`**

```typescript
// src/types/electron.d.ts
export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      getPrinters: () => Promise<string[]>;
      print: (data: unknown) => Promise<{ success: boolean; error?: string }>;
      saveConfig: (data: { domain: string; printerName: string }) => Promise<void>;
      saveFiscalSnapshot: (data: unknown) => Promise<{ success: boolean; path?: string; error?: string }>;
    };
  }
}
```

> Usamos `unknown` en `print` y `saveFiscalSnapshot` porque el main process recibe JSON serializado — el tipo concreto no necesita viajar al preload.

- [x] **Step 2: Verificar que TypeScript lo recoge**

El `tsconfig.json` ya incluye `"src/**/*.ts"` — el archivo es auto-descubierto. Verificar:

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Esperado: sin errores nuevos relacionados con `electronAPI`.

- [x] **Step 3: Commit**

```bash
git add src/types/electron.d.ts
git commit -m "feat(tpv): add Window.electronAPI global type declaration"
```

---

## Task 2: IPC handler en el main process

**Files:**
- Modify: `electron/main.ts`

Añadimos el handler `fiscal:save-snapshot` dentro de `setupIpc()`. El handler recibe el `InformeZData` serializado, crea el directorio si no existe, y escribe el JSON.

- [x] **Step 1: Añadir imports de `fs` al inicio de `electron/main.ts`**

Al inicio del archivo, después de los imports existentes, añadir:

```typescript
import * as fs from 'fs';
```

El import de `path` ya existe. Si no existe, añadirlo también:
```typescript
import * as path from 'path';
```

- [x] **Step 2: Añadir tipo local para el payload**

Justo después de la interfaz `StoreSchema` (línea ~11), añadir:

```typescript
interface FiscalSnapshotPayload {
  empresaNombre: string;
  aperturaAt: string;
  numeroZ: number;
  [key: string]: unknown;
}
```

> No importamos desde `@/` porque electron/main.ts tiene su propio contexto de compilación. El tipo mínimo es suficiente — IPC serializa todo a JSON de todas formas.

- [x] **Step 3: Añadir handler en `setupIpc()`**

Dentro de la función `setupIpc()`, después del handler `printer:print`:

```typescript
  ipcMain.handle('fiscal:save-snapshot', async (_event, data: FiscalSnapshotPayload) => {
    try {
      const slug = data.empresaNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = data.aperturaAt.slice(0, 10);
      const dir = path.join(app.getPath('userData'), 'fiscal', slug);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${date}-Z${data.numeroZ}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true, path: file };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });
```

- [x] **Step 4: Verificar que el archivo compila sin errores**

```bash
cd electron && npx tsc --noEmit 2>&1 | head -30
```

Si no hay `tsconfig.json` en `electron/`, usar:

```bash
npx tsc --noEmit --allowJs --moduleResolution node electron/main.ts 2>&1 | head -20
```

Esperado: sin errores en el handler nuevo.

- [x] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat(tpv): add fiscal:save-snapshot IPC handler — saves InformeZ JSON to disk"
```

---

## Task 3: Exponer `saveFiscalSnapshot` en el preload

**Files:**
- Modify: `electron/preload.ts`

Añadimos `saveFiscalSnapshot` al objeto expuesto por `contextBridge.exposeInMainWorld`.

- [x] **Step 1: Añadir `saveFiscalSnapshot` al contextBridge**

El archivo actual (`electron/preload.ts`) expone:
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,
  getPrinters: ...,
  print: ...,
  saveConfig: ...,
});
```

Añadir al final del objeto:

```typescript
  saveFiscalSnapshot: (data: unknown): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('fiscal:save-snapshot', data),
```

El resultado final del objeto debe quedar:

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,
  getPrinters: (): Promise<string[]> =>
    ipcRenderer.invoke('printer:list'),
  print: (data: ReceiptData): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('printer:print', data),
  saveConfig: (data: { domain: string; printerName: string }): Promise<void> =>
    ipcRenderer.invoke('store:set', data),
  saveFiscalSnapshot: (data: unknown): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('fiscal:save-snapshot', data),
});
```

- [x] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(tpv): expose saveFiscalSnapshot via contextBridge preload"
```

---

## Task 4: Llamar `saveFiscalSnapshot` en `TurnoCerrarForm`

**Files:**
- Modify: `src/components/tpv/TurnoCerrarForm.tsx`

El punto de llamada exacto es después de obtener el `InformeZData` (línea ~87-88). La llamada es fire-and-forget: no bloqueamos `setInformeZ(data)` ni el modal.

- [x] **Step 1: Localizar el punto de inserción en `handleCierre`**

En `src/components/tpv/TurnoCerrarForm.tsx`, dentro de `handleCierre`, el bloque relevante es:

```typescript
      if (zRes.ok) {
        const data = (await zRes.json()) as InformeZData;
        setInformeZ(data);
      } else {
        router.push('/tpv/turno/abrir');
      }
```

- [x] **Step 2: Añadir la llamada fire-and-forget**

Reemplazar ese bloque por:

```typescript
      if (zRes.ok) {
        const data = (await zRes.json()) as InformeZData;
        void window.electronAPI?.saveFiscalSnapshot(data);
        setInformeZ(data);
      } else {
        router.push('/tpv/turno/abrir');
      }
```

> `void` descarta la promesa intencionalmente (fire-and-forget). `window.electronAPI?.saveFiscalSnapshot` es `undefined` en web — no hay efecto secundario fuera de Electron.

- [x] **Step 3: Verificar que TypeScript acepta el cambio**

```bash
pnpm tsc --noEmit 2>&1 | grep TurnoCerrarForm
```

Esperado: sin salida (sin errores en ese archivo).

- [x] **Step 4: Verificar lint**

```bash
pnpm lint 2>&1 | grep TurnoCerrarForm
```

Esperado: sin warnings ni errores nuevos.

- [x] **Step 5: Commit**

```bash
git add src/components/tpv/TurnoCerrarForm.tsx
git commit -m "feat(tpv): save InformeZ fiscal snapshot to disk on turno close"
```

---

## Task 5: Smoke test manual + actualizar doc legal

**Files:**
- Modify: `docs/tpv-legal-compliance.md`

### Smoke test (requiere build Electron)

- [x] **Step 1: Compilar el bundle Electron**

```bash
pnpm build:electron:prep
```

- [x] **Step 2: Abrir el TPV en Electron y cerrar un turno**

Abrir un turno → cobrar al menos una venta → cerrar el turno con arqueo.

- [x] **Step 3: Verificar el archivo en disco**

En Windows:
```
%APPDATA%\{appName}\fiscal\{empresa-slug}\
```

Abrir el JSON y verificar que contiene `turnoId`, `numeroZ`, `hashEncadenado`, `desglosePagos`.

- [x] **Step 4: Marcar el ítem en el checklist legal**

En `docs/tpv-legal-compliance.md`, en la sección **WAL / Backup Fiscal**, añadir:

```markdown
- [x] **Snapshot fiscal en disco al cerrar turno** — `fiscal:save-snapshot` IPC handler. Guarda `InformeZData` en `{userData}/fiscal/{empresa-slug}/{fecha}-Z{numeroZ}.json` (20260714).
```

> Si la sección no existe todavía, añadirla al final del documento bajo un nuevo `## 10. Backup Fiscal Local`.

- [x] **Step 5: Commit final**

```bash
git add docs/tpv-legal-compliance.md
git commit -m "docs(tpv): mark fiscal snapshot as completed in legal compliance doc"
```
