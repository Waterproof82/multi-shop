# TPV — Plan: Sistema WAL Local-First y Backup Fiscal

> Estado: **PLANIFICADO — pendiente de implementación**
> Prerequisito a resolver: definir escenario offline (ver sección "Decisión pendiente" al final)

---

## Objetivo

Hacer el TPV infalible ante cortes de red e incidentes en Supabase, garantizando al mismo tiempo el cumplimiento fiscal (Ley Antifraude RD 1007/2023, RD 1619/2012).

El principio rector es **Write-Ahead Logging (WAL)**: el TPV escribe siempre primero en local y sincroniza en segundo plano con la nube.

---

## Arquitectura propuesta: Local-First con dos series fiscales

### Flujo de un cobro

```
Cajero pulsa "Cobrar"
    │
    ├─ 1. crypto.randomUUID()  →  id único del ticket (idempotencia)
    │
    ├─ 2. Escritura local INSTANTÁNEA (0 ms latencia)
    │      SQLite local: { id, serie: 'O', ...datos, status: 'pending_sync' }
    │      Hash local calculado (cadena serie O)
    │
    ├─ 3. Impresora térmica lee de SQLite local → imprime ticket físico
    │      Cajón de efectivo se abre
    │      → Para el cajero, la venta está CERRADA. No hay espera.
    │
    └─ 4. Background Worker detecta pending_sync
           Si hay red:
               POST /api/tpv/cobro  con el UUID del paso 1
               Supabase: UPSERT ON CONFLICT (id) DO NOTHING
               → estado local: 'synced'
           Si NO hay red:
               Queda en SQLite, el TPV puede seguir cobrando indefinidamente
```

### El problema de la cadena de hashes offline

El sistema actual genera los tickets en PostgreSQL con:
- Numeración correlativa atómica (`SELECT MAX + 1 FOR UPDATE`)
- Hash SHA-256 encadenado (cada ticket firma el hash del anterior)

Esto es incompatible con la generación offline porque:
- El dispositivo no conoce el hash del último ticket generado en la nube
- Dos terminales offline podrían generar el mismo `numero_ticket`

### Solución: dos series independientes

```
Serie T  →  tickets ONLINE   →  cadena en Supabase  (comportamiento actual)
Serie O  →  tickets OFFLINE  →  cadena local en SQLite del dispositivo
```

Cada serie mantiene su propia cadena de hashes independiente e inalterable.
La Ley Antifraude no exige una sola cadena global — exige que cada cadena sea
inalterable y verificable. Ambas series son fiscalmente válidas.

**Al reconectar**, los tickets de serie `O` se suben a Supabase tal cual,
con su cadena local intacta y su numeración propia. El UPSERT con el UUID
garantiza idempotencia (si se reintenta el sync, no se duplican).

**El informe Z** (cierre de turno) suma ambas series. El inspector puede:
- Verificar la cadena `T` directamente en Supabase
- Verificar la cadena `O` desde el export local del dispositivo

### Esquema local SQLite

```sql
-- Tabla de tickets pendientes de sincronización
CREATE TABLE tpv_cobros_local (
  id                   TEXT PRIMARY KEY,  -- UUID generado en frontend
  serie                TEXT NOT NULL,     -- 'T' (online) | 'O' (offline)
  numero_local         INTEGER NOT NULL,  -- correlativo local por serie+dispositivo
  hash_anterior_local  TEXT,
  hash_local           TEXT NOT NULL,
  empresa_id           TEXT NOT NULL,
  turno_id             TEXT NOT NULL,
  metodo_pago          TEXT NOT NULL,
  importe_cobrado_cents INTEGER NOT NULL,
  propina_cents        INTEGER NOT NULL DEFAULT 0,
  iva_porcentaje       REAL NOT NULL,
  base_imponible_cents INTEGER NOT NULL,
  iva_cents            INTEGER NOT NULL,
  detalle              TEXT NOT NULL,     -- JSON con los ítems del pedido
  cobrado_at           TEXT NOT NULL,     -- ISO 8601
  status               TEXT NOT NULL DEFAULT 'pending_sync',
                                         -- 'pending_sync' | 'synced' | 'sync_error'
  synced_at            TEXT,             -- ISO 8601, NULL hasta sync
  sync_attempts        INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índice para el background worker
CREATE INDEX idx_cobros_local_status ON tpv_cobros_local (status);

-- Tabla de estado del dispositivo
CREATE TABLE tpv_device_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- Claves usadas:
--   'device_id'        → UUID único del dispositivo (generado en primer arranque)
--   'last_serie_O_num' → último numero_local de serie O
--   'last_hash_O'      → último hash de la cadena serie O
```

### Archivo físico de cierre de turno

Al cerrar turno (`POST /api/tpv/turno/[id]/cerrar`), el Electron main process
guarda adicionalmente un JSON en disco local via IPC:

```
AppData/Roaming/TPV/fiscal/
├── {empresa-slug}/
│   ├── 2026-07-10-turno-1.json
│   ├── 2026-07-11-turno-1.json
│   └── 2026-07-12-turno-2.json
```

El JSON contiene: datos del turno, todos los cobros (serie T + serie O),
pedidos del período, mermas. Firmable localmente. Exportable a USB. Entregable
a un asesor fiscal sin acceso al panel web.

---

## Protección ante desastres en la nube

Si Supabase sufre corrupción, caída prolongada o ransomware:

1. **Contabilidad intacta**: cada TPV físico tiene su "libro de registro" local completo
2. **Cierre Z autónomo**: el informe Z se puede generar leyendo SQLite local sin red
3. **Reconstrucción**: SuperAdmin puede disparar un "Bulk Export" desde cada dispositivo
   para reinyectar el historial completo a una DB limpia (los UUIDs garantizan idempotencia)

---

## Componentes a implementar

### 1. Electron main process
- [ ] Añadir `better-sqlite3` como dependencia nativa de Electron
- [ ] Crear `electron/db.ts`: inicialización de SQLite, creación de tablas, device_id
- [ ] IPC handler `tpv:cobro-local`: recibe cobro del renderer, escribe en SQLite, retorna hash
- [ ] IPC handler `tpv:sync-pending`: lee `pending_sync`, hace POST a API, actualiza estado
- [ ] IPC handler `tpv:save-fiscal-snapshot`: escribe JSON de cierre en AppData
- [ ] Background Worker en main process: ejecuta sync cada 30s si hay red (`net.isOnline()`)

### 2. Renderer (frontend TPV)
- [ ] Al pulsar "Cobrar": generar UUID, llamar `window.electronAPI.cobroLocal(data)`
- [ ] Mostrar confirmación inmediata sin esperar respuesta de API
- [ ] Llamar `window.electronAPI.imprimir(data)` con los datos del ticket local
- [ ] Al cerrar turno: llamar `window.electronAPI.saveFiscalSnapshot(snapshot)`

### 3. API Supabase
- [ ] Modificar `POST /api/tpv/cobro` para aceptar `id` del cliente (UPSERT)
- [ ] Añadir campo `serie` a `tpv_cobros` con CHECK ('T', 'O')
- [ ] Trigger de hash: si `serie = 'O'`, respetar `hash` y `hash_anterior` recibidos del cliente
  (la cadena O ya viene sellada desde el dispositivo, no se recalcula en DB)
- [ ] Endpoint `POST /api/tpv/sync-batch`: acepta array de cobros, procesa en orden, retorna
  cuáles se sincronizaron y cuáles fallaron

### 4. Electron preload / contextBridge
```typescript
// electron/preload.ts — ampliar contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // ya existente:
  print: (data) => ipcRenderer.invoke('tpv:print', data),
  // nuevos:
  cobroLocal:         (data) => ipcRenderer.invoke('tpv:cobro-local', data),
  syncPending:        ()     => ipcRenderer.invoke('tpv:sync-pending'),
  saveFiscalSnapshot: (data) => ipcRenderer.invoke('tpv:save-fiscal-snapshot', data),
  getPendingCount:    ()     => ipcRenderer.invoke('tpv:pending-count'),
});
```

---

## Impacto en el sistema actual

| Área | Cambio necesario | Complejidad |
|------|-----------------|-------------|
| `electron/main.ts` | Añadir SQLite + IPC handlers | Alta |
| `electron/preload.ts` | Ampliar contextBridge | Baja |
| Frontend TPV (renderer) | Cambiar flujo de cobro a local-first | Media |
| `POST /api/tpv/cobro` | Aceptar id del cliente + lógica serie O | Media |
| `tpv_cobros` migration | Añadir columna `serie`, ajustar trigger | Baja |
| Build Electron | Añadir `better-sqlite3` con rebuild nativo | Media |

---

## Decisión pendiente — BLOQUEANTE

Antes de implementar, el usuario debe definir el **escenario offline** objetivo:

**Opción A — Microcortes de red (10-60 segundos)**

La UI del TPV ya está cargada en el WebView. Solo falla el sync a la nube.
El renderer puede usar el SQLite del main process vía IPC para guardar el cobro
y la impresión funciona igual. Cuando vuelve la red, el background worker sincroniza.

- No requiere cambios en cómo Electron sirve la UI
- El TPV sigue cargando desde `https://{domain}/tpv`
- **Complejidad: media**

**Opción B — Sin internet desde el arranque**

El TPV debe funcionar aunque no haya internet en absoluto al abrir la app.
Requiere que Electron sirva la UI localmente (Express embebido o bundle estático
en `file://`) porque el WebView no puede cargar `https://{domain}/tpv` sin red.

- Cambio arquitectónico mayor en el shell Electron
- La UI local debe estar pre-bundleada con el instalador
- Implica mantener dos versiones de la UI (web + local)
- **Complejidad: muy alta**

---

## Referencias

- `electron/main.ts` — proceso principal Electron (IPC, ventana, impresión)
- `electron/preload.ts` — contextBridge actual
- `src/app/tpv/cobro/[sesionId]/page.tsx` — flujo de cobro actual
- `supabase/migrations/20260703000001_tpv_cobros.sql` — tabla tpv_cobros y triggers
- `src/app/api/tpv/cobro/route.ts` — endpoint de cobro actual
- `docs/context/tpv-empleados-pin.md` — arquitectura dual-auth TPV
- `docs/tpv-legal-compliance.md` — checklist cumplimiento legal
