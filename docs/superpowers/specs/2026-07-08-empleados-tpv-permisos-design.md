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
```

- PIN is hashed with the same `hashPin(pin, empresaId)` function used for waiters.
- One empresa can have multiple cajero and encargado employees.
- Deactivated employees cannot log in but their name is preserved in historical turnos.

### New cookie: `tpv_employee_token`

A short-lived JWT (8h) issued on PIN login. Payload:

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
| TPV Cierre de Caja | Full | Full | Hidden |
| Header gear button (⚙) | Visible | Hidden | Hidden |
| Admin panel | Full | Redirect to /tpv | Redirect to /tpv |

### Implementation points

- `TpvRolContext` already exists — inject the role from either `admin_token` or `tpv_employee_token`.
- TPV layout reads both cookies and resolves a single `RolAdmin` for the session.
- `TpvHeader` currently shows ⚙ for `admin | encargado | superadmin`. This must change: `encargado` is removed from that condition (⚙ is admin-only since encargado has no admin panel access).
- Nav items "Mermas" and "Cierre de Caja" are conditionally hidden for `cajero`.
- The `/tpv/mermas` and `/tpv/turno/cerrar` server pages gate access by role and redirect `cajero` to `/tpv/mostrador`.

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
| `src/app/tpv/turno/cerrar/page.tsx` | Gate: redirect cajero |
| `src/app/admin/(protected)/configuracion/page.tsx` | Add Empleados tab |
| `src/components/admin/configuracion/EmpleadosTpvPanel.tsx` | New component |
| `src/proxy.ts` | Read `tpv_employee_token` for `/tpv/*` routes and set `x-admin-rol` + `x-empresa-id` headers |

---

## Security notes

- PIN hash uses the existing `hashPin(pin, empresaId)` — scoped per empresa so the same PIN in different empresas produces different hashes.
- `tpv_employee_token` is HttpOnly, SameSite=lax, 8h max-age.
- `/api/tpv/empleados/login` is rate-limited with `rateLimitAdmin`.
- Employees cannot log in to admin panel. The admin layout already redirects `cajero`; it will also redirect sessions authenticated via `tpv_employee_token` (which lack an `admin_token`).
- PIN entry page has no lockout UI but rate limit on the API protects brute force.

---

## Out of scope (this iteration)

- Per-action audit log (who did each cobro) — the turno's `operadorNombre` is sufficient.
- Stock management (ingredientes, recetas) in TPV for encargado — stays in admin panel, admin-only for now.
- Employee scheduling or shift assignment.
- Multi-employee same turno (only one person opens a turno).
