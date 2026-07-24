# LaborControl — Registro Digital de Jornada

> Cumplimiento legal: Art. 34.9 ET (Estatuto de los Trabajadores), RD-Ley 8/2019, Art. 12.4.c ET (trabajadores a tiempo parcial).

---

## 1. Propósito

El módulo **LaborControl** permite a las empresas registrar digitalmente la jornada laboral de sus empleados de forma legalmente válida en España. Cada fichaje queda grabado en una cadena de hashes SHA-256 inmutable e infalsificable, auditada y exportable en PDF y Excel para inspecciones de trabajo.

---

## 2. Arquitectura

### Bounded Context

```
src/core/laborcontrol/
├── domain/
│   ├── types.ts                    ← Todos los tipos de dominio
│   └── interfaces/
│       ├── IFichajeRepository.ts
│       ├── IPerfilLaboralRepository.ts
│       ├── IChainRepository.ts
│       ├── IAuditRepository.ts
│       ├── IExportRepository.ts
│       └── IHoldRepository.ts
├── application/
│   ├── dtos/
│   │   ├── fichaje.dto.ts
│   │   ├── correccion.dto.ts
│   │   ├── export.dto.ts
│   │   └── perfil-laboral.dto.ts
│   └── use-cases/
│       ├── RegistrarFichaje.usecase.ts
│       ├── RegistrarCorreccion.usecase.ts
│       ├── ObtenerMisFichajes.usecase.ts
│       ├── ObtenerEstadoSupervisor.usecase.ts
│       ├── GenerarExport.usecase.ts
│       ├── GenerarResumenParcial.usecase.ts
│       ├── GestionarHold.usecase.ts
│       └── VerificarCadena.usecase.ts
└── infrastructure/
    ├── index.ts                    ← Factory de singletons lazy
    ├── SupabaseFichajeRepository.ts
    ├── SupabasePerfilLaboralRepository.ts
    ├── SupabaseChainRepository.ts
    ├── SupabaseAuditRepository.ts
    ├── SupabaseHoldRepository.ts
    ├── SupabaseExportRepository.ts
    └── renderers/
        ├── PdfRenderer.ts          ← @react-pdf/renderer streaming
        └── ExcelRenderer.ts        ← exceljs WorkbookWriter streaming
```

### Flujo de capas

```
API Route (Zod validation)
    ↓
Use Case (business logic)
    ↓
Repository Interface
    ↓
Supabase Infrastructure (BEFORE INSERT trigger → chain hash)
```

---

## 3. Base de Datos

### Tablas principales

| Tabla | Propósito |
|-------|-----------|
| `lc_perfil_laboral` | Perfil laboral del empleado (contrato, jornada, centro, timezone) |
| `lc_fichajes` | Tabla particionada mensualmente. Cada fila = un evento de jornada |
| `lc_chain_anchors` | Anclas selladas por mes para verificación rápida |
| `lc_legal_holds` | Retenciones legales (bloquean purga RGPD de fichajes) |
| `lc_fichajes_hold_archive` | Archivo de fichajes liberados de retención |
| `lc_audit_log` | Log de todas las acciones del módulo (append-only) |
| `lc_review_queue` | Cola de fichajes pendientes de revisión por supervisor |
| `lc_rlt_asignaciones` | Representantes Legales de los Trabajadores por empresa |

### `lc_fichajes` — estructura y particionado

```sql
-- Particionada por RANGE en timestamp_servidor (mes a mes)
-- Partición nombrada: lc_fichajes_YYYY_MM
-- chain_seq: secuencia global monotónica (nunca se reinicia)

CREATE TABLE public.lc_fichajes (
  record_id         UUID NOT NULL DEFAULT gen_random_uuid(),
  chain_seq         BIGINT NOT NULL,        -- global, monotónico
  empresa_id        UUID NOT NULL,
  centro_id         UUID NOT NULL,
  empleado_id       UUID NOT NULL,
  actor_id          UUID NOT NULL,          -- quien realizó la acción
  tipo              TEXT NOT NULL,          -- entrada | salida | inicio_pausa | fin_pausa | correccion
  accion            TEXT,                   -- rectificar | anular (solo correcciones)
  ref_correccion    UUID,                   -- record_id que se corrige
  timestamp_evento  TIMESTAMPTZ NOT NULL,   -- hora según el cliente
  timestamp_servidor TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  motivo            TEXT,
  chain_hash        TEXT NOT NULL,          -- SHA-256 del payload canónico
  prev_hash         TEXT NOT NULL,          -- hash del registro anterior
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (timestamp_servidor);
```

### Cadena de integridad SHA-256

El trigger `lc_before_insert_chain` se ejecuta **BEFORE INSERT** y:
1. Obtiene el `chain_seq` siguiente de la secuencia global
2. Recupera el `chain_hash` del registro anterior del mismo `empresa_id`
3. Construye el payload canónico: `v1|chain_seq=N|empresa_id=X|empleado_id=Y|tipo=Z|ts=ISO|prev=HASH`
4. Calcula `SHA-256(payload)` con pgcrypto y lo escribe en `chain_hash`
5. Escribe `prev_hash` con el hash anterior

> **El cliente nunca calcula el hash.** Pasa `chain_hash='PENDING'` y el trigger lo sobreescribe antes de que se aplique ningún constraint NOT NULL.

El payload canónico es reproducible desde TypeScript con `src/lib/laborcontrol/chain-hash.ts` para herramientas de verificación offline.

---

## 4. Tipos de Evento

| `tipo` | Descripción |
|--------|-------------|
| `entrada` | Inicio de jornada |
| `salida` | Fin de jornada |
| `inicio_pausa` | Inicio de pausa (descanso, comida, etc.) |
| `fin_pausa` | Fin de pausa |
| `correccion` | Registro supervisor que anula o rectifica otro registro |

### Correcciones

Una corrección siempre referencia el `record_id` del fichaje original mediante `ref_correccion`:

- `accion='anular'` → el original queda marcado como **superseded** (se conserva, nunca se borra)
- `accion='rectificar'` → el original queda superseded y la corrección lleva el timestamp correcto

El campo `superseded` no existe en BD — es calculado en el use case `ObtenerMisFichajesUseCase` en memoria, comparando los `ref_correccion` de las correcciones contra los `record_id` del listado.

---

## 5. API Endpoints

### Fichajes

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/laborcontrol/fichaje` | `cajero / encargado / admin` | Registrar entrada/salida/pausa. `centroId` es opcional — se resuelve del perfil si no se envía. |
| `GET` | `/api/laborcontrol/fichajes/[empleadoId]?from=&to=` | propia sesión ó `admin/encargado` | Fichajes del empleado en el rango. Incluye campo `superseded`. |

### Supervisión

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/laborcontrol/supervisor` | `admin / encargado` | Estado en tiempo real de todos los empleados (`dentro / pausa / fuera / sin_datos`) |
| `POST` | `/api/laborcontrol/correcciones` | `admin / encargado` | Registrar corrección con motivo |

### Exportación (Art. 34.9 ET)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/laborcontrol/export?tipo=pdf\|excel&from=&to=` | `admin` | Descarga PDF o XLSX del registro de jornada |
| `GET` | `/api/laborcontrol/export/parcial?mes=&anio=` | `admin` | Resumen mensual para trabajadores a tiempo parcial (Art. 12.4.c ET) |

### Integridad

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/laborcontrol/chain/verify?year=&month=` | `admin` | Verifica la cadena SHA-256 del mes indicado vía RPC `lc_verify_chain_segment` |

### Retenciones Legales

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/laborcontrol/holds` | `admin` | Lista retenciones activas |
| `POST` | `/api/laborcontrol/holds` | `admin` | Crea retención (bloquea purga RGPD) |

### Cron Jobs (Vercel)

| Ruta | Cron | Descripción |
|------|------|-------------|
| `/api/laborcontrol/cron/seal` | `0 2 2 * *` | Día 2 de cada mes a las 02:00 UTC — sella los anclas del mes anterior |
| `/api/laborcontrol/cron/partition` | `0 1 25 * *` | Día 25 a las 01:00 UTC — crea la partición del mes siguiente |

---

## 6. Integración con TPV

### Kiosk (modo principal)

`/tpv/fichajes` es la ruta principal de fichaje. Opera en **modo kiosk**: cualquier empleado puede fichar introduciendo su PIN sin cerrar la sesión del cajero/admin activo. Flujo en dos fases:

1. **Fase 1** (`{ pin }`): identifica al empleado y sugiere el tipo de evento (`entrada / salida / inicio_pausa / fin_pausa`) según su último registro.
2. **Fase 2** (`{ pin, tipo }`): registra el fichaje en `lc_fichajes` vía `POST /api/laborcontrol/fichaje/kiosk`.

### FichajeDialog

Componente modal `src/components/laborcontrol/FichajeDialog.tsx` que aparece en dos momentos del flujo TPV:

1. **Post-login** (`TpvLoginForm`): tras autenticarse con PIN, aparece el diálogo preguntando "¿Fichar entrada?" El empleado puede fichar o omitir.
2. **Post-cierre de turno** (`TurnoCerrarForm`): al cerrar el turno, aparece el diálogo para "Fichar salida".

### Mis Fichajes (empleado)

Ruta `/tpv/fichajes` — accesible con cualquier sesión de empleado autenticada. Muestra los últimos 30 días de fichajes del empleado autenticado. Tiene un timer de inactividad de 60 segundos que redirige automáticamente a `/tpv/mostrador`.

### Navegación

El `TpvHeader` muestra dos grupos de enlaces en la barra de navegación:

- **Grupo principal**: Analítica, Mostrador, etc.
- **Grupo laboral** (estilo ámbar, separado visualmente): `⏱ Fichajes` (todos los roles) y `📋 Jornada` (solo `admin` / `encargado`).

---

## 7. Panel Supervisor

Rutas:
- `/tpv/jornada` — panel inline dentro del shell TPV (acceso rápido desde el header)
- `/laborcontrol/supervisor` — acceso directo con botón volver (mismo componente `SupervisorPanel`)

Protección de ruta: `src/app/laborcontrol/layout.tsx` verifica que el token activo sea `admin / encargado / superadmin`. Redirige a `/tpv/login` si no se cumple.

Dashboard en tiempo real (cliente) que muestra el estado actual de cada empleado:

| Estado | Condición |
|--------|-----------|
| `dentro` | Último evento = `entrada` ó `fin_pausa` |
| `pausa` | Último evento = `inicio_pausa` |
| `fuera` | Último evento = `salida` |
| `sin_datos` | Sin ningún fichaje registrado |

Se actualiza automáticamente vía **Supabase Realtime** — suscripción a `postgres_changes` `INSERT` en `lc_fichajes`. No hay polling.

**Vista RLT** (`/laborcontrol/rlt`): versión de solo lectura para Representantes Legales de los Trabajadores. Mismos datos, sin acciones.

---

## 8. Electron

### PIN Cache Electron

`src/lib/laborcontrol/pin-cache.ts`

Para instalaciones Electron sin conexión permanente:
- `cachePin(empleadoId, pin)` — hashea el PIN con **bcryptjs** (work factor 12) y lo guarda en `electron-store` bajo `lc_pin_cache`
- `verifyPinOffline(empleadoId, pin)` — compara el PIN con el hash almacenado
- **Rate limit**: máximo 4 intentos por ventana de 30 segundos por empleado
- Requiere que el main process Electron exponga `window.electronAPI.lcPinStore` vía IPC

### Hash TS Reference

`src/lib/laborcontrol/chain-hash.ts`

Implementación TypeScript del hash canónico idéntica al trigger Postgres. Útil para herramientas de auditoría y verificación offline sin necesidad de conectarse a la DB.

```typescript
computeChainHash({
  chainSeq: 42,
  empresaId: 'uuid',
  empleadoId: 'uuid',
  tipo: 'entrada',
  timestampServidor: new Date('2026-07-24T09:00:00Z'),
  prevHash: 'abc123...',
})
// → SHA-256 hex idéntico al que calcula el trigger
```

---

## 9. Exportación de Registros

### PDF — @react-pdf/renderer

`PdfRenderer.ts` genera un PDF con:
- Cabecera: nombre de empresa, empleado, período
- Tabla de fichajes: fecha/hora evento, tipo, fecha/hora servidor, motivo/corrección
- Pie con cláusula RGPD: "El registro de jornada se realiza en base al Art. 6.1.c RGPD (obligación legal) en cumplimiento del Art. 34.9 ET."

Usa `renderToStream()` → retorna un `Readable` Node.js que el API route convierte a `ReadableStream` Web para Next.js (`new ReadableStream({ start(controller) { stream.on('data', ...) } })`).

### Excel — ExcelJS WorkbookWriter

`ExcelRenderer.ts` genera un XLSX con:
- Una hoja por empleado
- Columnas: Fecha/hora evento, Tipo, Acción, Fecha/hora servidor, Motivo/Corrección, Chain Hash
- Formato de fecha `dd/mm/yyyy hh:mm:ss` en columnas de timestamp
- Column widths ajustados (hash SHA-256 en col 7 = width 68)
- Streaming real con `PassThrough` — no acumula el workbook completo en memoria

### Resumen Parcial (Art. 12.4.c ET)

Solo para empleados con `tiempo_parcial = true`. Se genera en PDF, filtrado por mes. Debe entregarse junto con la nómina mensual.

---

## 10. Verificación de Cadena

El endpoint `GET /api/laborcontrol/chain/verify?year=YYYY&month=M` llama al RPC `lc_verify_chain_segment(empresaId, year, month)` que:
1. Recorre todos los fichajes del mes en orden de `chain_seq`
2. Recomputa el hash de cada registro con `lc_canonical_payload()`
3. Compara con el `chain_hash` almacenado
4. Devuelve `status: 'ok' | 'broken' | 'tampered' | 'empty'`

Si hay manipulación, `broken_at` indica el `chain_seq` del primer registro corrupto.

Cada verificación queda registrada en `lc_audit_log`.

---

## 11. Retenciones Legales (Bloqueo RGPD)

Las `lc_legal_holds` bloquean la purga automática RGPD de los fichajes del empleado o de toda la empresa durante el período indicado. Útil cuando hay:
- Litigio laboral en curso
- Inspección de trabajo abierta
- Requerimiento de la Tesorería General de la Seguridad Social

Una retención activa (`activo = true` y `fecha_fin >= hoy`) impide cualquier eliminación de `lc_fichajes` para el `empresa_id`/`empleado_id` afectado.

---

## 12. Perfil Laboral

`lc_perfil_laboral` extiende la identidad de `empleados_tpv` con datos laborales:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `empleado_id` | UUID | FK a `empleados_tpv.id` |
| `centro_id` | UUID | Centro de trabajo (FK a `empresas.id` — usa la empresa como centro por ahora) |
| `jornada_teorica_horas` | NUMERIC | Jornada laboral teórica (ej: 8.0) |
| `tipo_contrato` | ENUM | `indefinido / temporal / obra_servicio / practicas / formacion / otro` |
| `tiempo_parcial` | BOOLEAN | Si es parcial, genera el resumen mensual Art. 12.4.c ET |
| `convenio` | TEXT | Nombre del convenio colectivo aplicable |
| `timezone` | TEXT | `Europe/Madrid` por defecto |
| `activo` | BOOLEAN | Si está activo, aparece en el panel supervisor |

### Offboarding

Cuando se intenta eliminar un empleado desde `/admin/empleados-tpv`, `SupabaseEmpleadoTpvRepository.delete()` comprueba primero si existe `lc_perfil_laboral` activo:
- **Si existe**: soft-delete — se desactiva el perfil (`activo = false`) y se marca el empleado como inactivo. **No se borra ningún dato de jornada** (obligación de conservación 4 años, Art. 34.9 ET).
- **Si no existe**: hard DELETE normal.

---

## 13. Trampas Críticas

- **`chain_hash='PENDING'` en INSERT**: el cliente siempre pasa este placeholder. El trigger BEFORE INSERT lo sobreescribe. Nunca calcules el hash en el cliente para inserción — solo para verificación.
- **`centroId` es opcional en POST `/api/laborcontrol/fichaje`**: si no se envía, el servidor lo resuelve del `lc_perfil_laboral` activo del empleado.
- **Partición mensual**: si no existe la partición del mes actual, el INSERT falla con `no partition of relation "lc_fichajes" found for row`. La partición se crea con el cron del día 25, pero la primera hay que crearla manualmente (o via RPC `lc_create_next_partition`).
- **`perfiles_admin.id` es el auth UID**: no hay columna `user_id` en `perfiles_admin`. Las policies RLS usan `pa.id = auth.uid()`.
- **Correcciones y `superseded`**: el campo `superseded` no existe en DB — se calcula en `ObtenerMisFichajesUseCase` comparando `ref_correccion` de las correcciones. Si consultas la DB directamente, no verás ese campo.
- **Exportación streaming**: los renderers devuelven un `Readable` Node.js. Las API routes lo convierten a `ReadableStream` Web antes de devolverlo con `new NextResponse(webStream)`. No acumules todo en memoria con `Buffer.concat`.
- **PIN cache Electron**: requiere exponer `window.electronAPI.lcPinStore` desde `main.ts` via IPC. Sin esto, `verifyPinOffline` lanza `'PIN cache only available in Electron'`.
- **Cron seal**: ejecutar el día 2 del mes (no el 1) para garantizar que todos los fichajes de fin de mes están ya en la partición antes de sellar.
