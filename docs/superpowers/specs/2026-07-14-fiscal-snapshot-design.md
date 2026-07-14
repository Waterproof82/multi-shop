# Design: Snapshot Fiscal Local al Cerrar Turno

**Fecha:** 2026-07-14
**Estado:** Aprobado

## Objetivo

Al cerrar un turno en el TPV Electron, guardar el `InformeZData` completo como JSON en disco local. Esto garantiza que el asesor fiscal pueda auditar el cierre sin acceso al panel web, y sirve como copia de seguridad ante caídas de Supabase.

## Contexto

- El turno se cierra vía `POST /api/tpv/turno/[id]/cerrar`
- Inmediatamente después, `TurnoCerrarForm` llama `GET /api/tpv/turno/[id]/informe-z` y obtiene `InformeZData`
- `InformeZData` contiene: turnoId, numeroZ, operadorNombre, aperturaAt, cierreAt, hashEncadenado, empresaNombre, empresaNif, totales, desglosePagos, movimientos
- La comunicación frontend → Electron main process se hace via IPC (`ipcMain.handle` / `ipcRenderer.invoke`)

## Ruta en disco

```
{app.getPath('userData')}/fiscal/{empresa-slug}/{YYYY-MM-DD}-Z{numeroZ}.json
```

- **empresa-slug**: `empresaNombre` lowercased, caracteres no alfanuméricos reemplazados por guión
- **fecha**: primeros 10 chars de `aperturaAt` (ISO 8601)
- **Contenido**: `JSON.stringify(informeZData, null, 2)`

Ejemplo en Windows:
```
C:\Users\PC\AppData\Roaming\TPV\fiscal\mi-restaurante\2026-07-14-Z42.json
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `electron/main.ts` | Handler `fiscal:save-snapshot` en `setupIpc()` |
| `electron/preload.ts` | Exponer `saveFiscalSnapshot` en contextBridge |
| `src/types/electron.d.ts` | Nuevo — `declare global` para `Window.electronAPI` |
| `src/components/tpv/TurnoCerrarForm.tsx` | Llamar `saveFiscalSnapshot(data)` fire-and-forget después de obtener el informe Z |

## Comportamiento

- **Fire-and-forget**: el guardado no bloquea la aparición del modal `InformeZModal`. Si falla, se loguea a consola y el flujo continúa normal.
- **Solo en Electron**: `window.electronAPI?.saveFiscalSnapshot` es `undefined` en web — no hay efecto secundario.
- **Idempotente**: si el archivo ya existe (ej. cierre re-intentado), se sobreescribe.

## Handler IPC (main.ts)

```typescript
ipcMain.handle('fiscal:save-snapshot', async (_event, data: InformeZSnapshotPayload) => {
  const slug = data.empresaNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const date = data.aperturaAt.slice(0, 10);
  const dir = path.join(app.getPath('userData'), 'fiscal', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date}-Z${data.numeroZ}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return { success: true, path: file };
});
```

## Tipo compartido

`InformeZSnapshotPayload` = `InformeZData` de `@/core/domain/entities/tpv-types`. El main process recibe este objeto serializado via IPC (IPC serializa/deserializa JSON automáticamente).

El `electron/main.ts` no puede importar desde `@/` — se declara localmente un tipo mínimo con los campos usados (`empresaNombre`, `aperturaAt`, `numeroZ`), o se acepta `unknown` y se hace cast.

## Tipo global Window

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

## Llamada en TurnoCerrarForm

```typescript
// Después de: const data = (await zRes.json()) as InformeZData;
void (window.electronAPI?.saveFiscalSnapshot(data));
setInformeZ(data);
```
