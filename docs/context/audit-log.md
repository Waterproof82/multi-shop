# Sistema de Auditoría (Audit Log)

## Propósito

Registra quién hizo qué en el sistema: abre turno, cierra sesión de mesa, ajusta stock, etc. Permite resolver disputas operativas y detectar errores sin depender de logs de servidor.

## Arquitectura

```
API Route → getAuditLogRepository().insert(payload)  [fire-and-forget]
API Route GET /api/admin/audit-log → findByEmpresa()
```

- **No bloquea**: `insert()` es fire-and-forget (`void` + swallow). Un fallo de audit nunca interrumpe la operación principal.
- **Solo service_role puede escribir** (RLS: authenticated tiene `INSERT WITH CHECK (false)`).
- **Solo authenticated puede leer** su propia empresa (`empresa_id = get_mi_empresa_id()`).

## Archivos Clave

| Archivo | Rol |
|---------|-----|
| `supabase/migrations/20260719000001_audit_log.sql` | Tabla, RLS, GRANTs, índice |
| `src/core/domain/entities/audit-types.ts` | `AuditAction`, `ActorTipo`, `InsertAuditPayload`, `AuditLogEntry` |
| `src/core/domain/repositories/IAuditLogRepository.ts` | Interfaz del repo |
| `src/core/infrastructure/repositories/supabase-audit-log.repository.ts` | Implementación |
| `src/core/infrastructure/api/audit-actor.ts` | `resolveActor()` — extrae identidad del actor desde headers del proxy |
| `src/core/infrastructure/database/index.ts` | `getAuditLogRepository()` singleton |
| `src/app/api/admin/audit-log/route.ts` | GET con paginación y filtros |
| `src/app/admin/(protected)/audit-log/page.tsx` | UI con tabla, filtros, paginación |

## Patrón de Uso en Rutas

```typescript
import { getAuditLogRepository } from '@/core/infrastructure/database';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';

// Dentro del handler, DESPUÉS de que la operación principal tenga éxito:
if (result.success) {
  const actor = resolveActor(req);
  void getAuditLogRepository().insert({
    empresaId,
    action: 'tpv.turno.abrir',
    payload: { turnoId: result.data.id },
    ...actor,
  });
}
```

## resolveActor()

Extrae la identidad del actor desde los headers que inyecta el proxy:

| Header | ActorTipo |
|--------|-----------|
| `x-employee-id` | `empleado_tpv` |
| `x-admin-id` | `admin` |
| `x-waiter-role: waiter` | `waiter` (actorId = null) |
| Ninguno | `admin` (actorId = null) |

Para rutas de login (donde el ID del actor solo se conoce tras la operación):
```typescript
const actor = resolveActor(req, empleadoId); // overrideId
```

## Acciones Instrumentadas

| Acción | Ruta |
|--------|------|
| `tpv.turno.abrir` | POST `/api/tpv/turno` |
| `tpv.turno.cerrar` | POST `/api/tpv/turno/[id]/cerrar` |
| `tpv.cobro.completar` | POST `/api/tpv/cobro` |
| `tpv.cobro.rectificar` | POST `/api/tpv/cobro/rectificar` |
| `tpv.caja.movimiento` | POST `/api/tpv/turno/[id]/movimiento-caja` |
| `tpv.stock.merma` | POST `/api/tpv/stock/mermas` |
| `tpv.empleado.login` | POST `/api/tpv/empleados/login` |
| `tpv.empleado.logout` | POST `/api/tpv/empleados/logout` |
| `waiter.mesa.cerrar_sesion` | POST `/api/waiter/mesas/[mesaId]/close` |
| `waiter.pedido.validar` | POST `/api/waiter/pendientes/validate` |
| `waiter.pago.manual` | POST `/api/waiter/mesas/[mesaId]/manual-payment` |
| `admin.stock.ajuste` | POST `/api/admin/stock/ingredientes/[id]/ajuste` |

## Trampas

- **No awaitar `insert()`** — es fire-and-forget por diseño. Si se awaita, un fallo de Supabase puede romper la respuesta de la ruta principal.
- **Errores de insert van a Sentry**, no a la respuesta HTTP. Ver el `console.error` + `captureException` en el repo.
- **`actor_id` es nullable** — waiter no tiene ID individual; `actorId` llega como `null`.
- **Añadir nueva acción**: (1) extender el tipo `AuditAction` en `audit-types.ts`, (2) añadir el label en `ACTION_LABELS` en `audit-log/page.tsx`, (3) añadirla a `AUDIT_ACTIONS` en la misma página.
