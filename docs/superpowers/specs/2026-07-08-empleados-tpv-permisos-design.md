# Design: Sistema de empleados TPV con permisos y PIN

**Date:** 2026-07-08
**Status:** Approved

---

## Context

The TPV currently has four roles (`superadmin`, `admin`, `encargado`, `cajero`) defined in the domain layer but without real permissions. All authenticated users get full access. The turno operator name is typed manually as free text. No employee registry exists.

This design adds:
1. A typed employee registry (cajero / encargado) with PIN authentication
2. Real TPV access control per role
3. Auto-populated operator name from the employee profile when opening a shift

---

## Operational model (confirmed with user)

- One turno = one operator. The person who opens the turno is responsible for the full session.
- Waiter PDA payments go through Redsys and do NOT appear in the TPV cash register.
- The `operadorNombre` on the turno is the only tracking needed — no per-action audit log.
- Cajero and encargado use PIN only (no email/password). They are separate entities from `perfiles_admin`.
- Admin (email/password login) retains full access to both admin panel and TPV.

---

## Architecture

### New DB table: `empleados_tpv`

```sql
CREATE TABLE public.empleados_tpv (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  rol         TEXT NOT NULL CHECK (rol IN ('cajero', 'encargado')),
  pin_hash    TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce unique PIN per empresa among active employees
-- (PIN is hashed, so uniqueness is on the hash)
CREATE UNIQUE INDEX uq_empleados_tpv_pin_empresa
  ON public.empleados_tpv (empresa_id, pin_hash)
  WHERE activo = true;
```

- PIN is hashed with the same `hashPin(pin, empresaId)` function used for waiters.
- PINs must be unique among **active** employees of the same empresa (enforced by the partial index above). The admin panel validates this before persisting.
- One empresa can have multiple cajero and encargado employees.
- Deactivating an employee (`activo = false`) frees their PIN hash for reuse but their name is preserved in historical turnos.

### Turnos table: add `operador_id`

```sql
ALTER TABLE public.turnos
  ADD COLUMN operador_id UUID REFERENCES empleados_tpv(id) ON DELETE SET NULL;
```

When a turno is opened via PIN session, `operador_id` is written alongside `operador_nombre`. For turnos opened by an admin (email login), `operador_id` is NULL and `operador_nombre` is the free-text name typed by the admin. This preserves backwards compatibility and enables future analytics by employee.

### New cookie: `tpv_employee_token`

A short-lived JWT (1h) issued on PIN login, with automatic sliding-window refresh. While the employee is actively using the TPV, the proxy renews the cookie on each authenticated request (new JWT, same payload, reset 1h expiry). If an employee is deactivated, their token expires within 1h maximum.

Payload:

```json
{
  "empleadoId": "uuid",
  "empresaId": "uuid",
  "nombre": "María García",
  "rol": "cajero"
}
```

This cookie is separate from `admin_token`. The TPV layout checks either cookie.

---

## Authentication flow

```
GET /tpv
  ├── admin_token valid (admin via email)  → pass through, full access
  ├── tpv_employee_token valid             → pass through, role-scoped access
  └── neither                             → redirect /tpv/login
        └── PIN entry screen
              └── POST /api/tpv/empleados/login
                    ├── PIN invalid → error
                    └── PIN valid   → set tpv_employee_token cookie
                                    → redirect /tpv/turno/abrir (or /tpv/mostrador if turno exists)
```

### Turno opening with PIN session

When `tpv_employee_token` is present, `/tpv/turno/abrir` pre-fills `operadorNombre` from the token payload. The employee does not type their name — it is read from their profile automatically.

---

## Permissions matrix

| Feature | Admin | Encargado | Cajero |
|---|---|---|---|
| TPV Mostrador | Full | Full | Full |
| TPV Mesas | Full | Full | Full |
| TPV Cobro | Full | Full | Full |
| TPV Historial | Full | Full | View (filtered to their turnoId) |
| TPV Mermas | Full | Full | Hidden |
| TPV Cierre de Caja | Full (with discrepancy) | Full (with discrepancy) | Blind close only |
| Header gear button (⚙) | Visible | Hidden | Hidden |
| Admin panel | Full | Redirect to /tpv | Redirect to /tpv |

### Implementation points

- `TpvRolContext` already exists — inject the role from either `admin_token` or `tpv_employee_token`.
- TPV layout reads both cookies and resolves a single `RolAdmin` for the session.
- `TpvHeader` currently shows ⚙ for `admin | encargado | superadmin`. This must change: `encargado` is removed from that condition (⚙ is admin-only since encargado has no admin panel access).
- Nav item "Mermas" is hidden for `cajero`. `/tpv/mermas` server page redirects `cajero` to `/tpv/mostrador`.
- "Cierre de Caja" nav item is visible for `cajero` but leads to a **blind close** variant of the page: the cajero can declare their counted cash amount and submit, but the system does not reveal the expected total or the discrepancy. The discrepancy is computed and stored server-side. Only `encargado` and `admin` see the full arqueo with the difference.
- The `/tpv/turno/cerrar` page receives the role from context and renders the appropriate variant (full or blind).

---

## Admin panel: Employee management

**Location:** `/admin/configuracion` → new tab "Empleados"

The admin can:
- View list of all cajero/encargado employees (name, role, status, created date)
- Create a new employee (name + role + PIN)
- Change an employee's PIN
- Toggle active/inactive

**API routes:**
- `GET /api/admin/empleados-tpv` — list employees for the empresa
- `POST /api/admin/empleados-tpv` — create employee
- `PATCH /api/admin/empleados-tpv/[id]` — update PIN or deactivate
- `DELETE /api/admin/empleados-tpv/[id]` — hard delete (only if no turno history)

All routes require `requireRole(['admin', 'superadmin'])`.

---

## TPV login page: `/tpv/login`

A PIN entry screen similar to the waiter login. Shows:
- Company logo / name
- Numeric PIN input (4-8 digits)
- Submit button
- On error: "PIN incorrecto"

This page is accessible without any auth cookie. On success it sets `tpv_employee_token` and redirects.

PINs are unique per active empresa (enforced in DB), so a single PIN field unambiguously identifies the employee. No employee selector is shown.

## TPV lock screen

A "Bloquear TPV" button is added to `TpvHeader` when the session is authenticated via `tpv_employee_token` (not for admin email sessions). Clicking it:
1. Calls `POST /api/tpv/empleados/logout` → clears the `tpv_employee_token` cookie
2. Does NOT close or affect the active turno
3. Redirects to `/tpv/login`

On re-login with PIN, the turno is already active and the employee lands on `/tpv/mostrador` as normal. This allows mid-shift handoff (e.g., encargado uses the TPV briefly and then the cajero reclaims it) while maintaining full trazabilidad per turno.

---

## Files affected

| File | Change |
|---|---|
| `supabase/migrations/20260708000001_empleados_tpv.sql` | New table + RLS |
| `src/core/domain/repositories/IEmpleadoTpvRepository.ts` | New interface |
| `src/core/infrastructure/database/supabase-empleado-tpv.repository.ts` | Implementation |
| `src/core/infrastructure/database/index.ts` | Export new repo |
| `src/core/application/use-cases/tpv/empleado-tpv-login.use-case.ts` | PIN validation |
| `src/app/tpv/login/page.tsx` | New login page |
| `src/app/api/tpv/empleados/login/route.ts` | POST login endpoint |
| `src/app/api/admin/empleados-tpv/route.ts` | GET + POST |
| `src/app/api/admin/empleados-tpv/[id]/route.ts` | PATCH + DELETE |
| `src/app/tpv/layout.tsx` | Check both cookies, resolve role |
| `src/app/tpv/turno/abrir/page.tsx` | Pre-fill name from token |
| `src/components/tpv/TurnoAbrirForm.tsx` | Accept pre-filled name |
| `src/components/tpv/TpvHeader.tsx` | Hide gear for encargado; hide Mermas/Cierre for cajero |
| `src/app/tpv/mermas/page.tsx` | Gate: redirect cajero |
| `src/app/tpv/turno/cerrar/page.tsx` | Show blind-close variant for `cajero`, full arqueo for others |
| `src/app/api/tpv/empleados/logout/route.ts` | POST: clear tpv_employee_token cookie |
| `src/app/admin/(protected)/configuracion/page.tsx` | Add Empleados tab |
| `src/components/admin/configuracion/EmpleadosTpvPanel.tsx` | New component |
| `src/proxy.ts` | Read `tpv_employee_token` for `/tpv/*` routes and set `x-admin-rol` + `x-empresa-id` headers |

---

## Security notes

- PIN hash uses the existing `hashPin(pin, empresaId)` — scoped per empresa so the same PIN in different empresas produces different hashes.
- `tpv_employee_token` is HttpOnly, SameSite=lax, 1h max-age.
- `/api/tpv/empleados/login` is rate-limited with `rateLimitAdmin`.
- Employees cannot log in to admin panel. The admin layout already redirects `cajero`; it will also redirect sessions authenticated via `tpv_employee_token` (which lack an `admin_token`).
- PIN entry page has no lockout UI but the rate limit on the API protects brute force.
- The unique partial index `WHERE activo = true` means a deactivated employee's PIN hash is no longer checked against active employees — reactivating them re-enters them into the uniqueness check.

### Token refresh strategy (late-window + DB check on renewal)

The app runs on Vercel serverless — there is no shared memory or Redis, so a blacklist is not viable. Instead:

1. On **every** TPV request: proxy validates only the JWT signature (no DB call). Fast path.
2. If the token has **< 15 minutes remaining**: proxy queries `empleados_tpv` for `activo = true`.
   - Active → issue a fresh 1h token (sliding window, but infrequent).
   - Inactive → do NOT renew. The current token expires within 15 min.

This limits the deactivation gap to the remaining lifetime of the last issued token — at most ~1h, in practice 15–60 min. For a physical POS device in a restaurant this is operationally acceptable; the admin can also physically reclaim the device or press "Bloquear TPV" to force immediate re-authentication.

---

## Out of scope (this iteration)

- Per-action audit log (who did each cobro) — the turno's `operadorNombre` is sufficient.
- Stock management (ingredientes, recetas) in TPV for encargado — stays in admin panel, admin-only for now.
- Employee scheduling or shift assignment.
- Multi-employee same turno (only one person opens a turno).
