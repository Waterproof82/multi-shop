# TPV — Sistema de empleados con PIN y permisos

## Qué es

Sistema de autenticación por PIN para cajeros y encargados de TPV. Permite que el personal de caja acceda al TPV sin tener cuenta en `auth.users` ni email/password. Coexiste con la autenticación admin estándar (email/password → `admin_token`).

---

## Tabla DB: `empleados_tpv`

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

-- PIN único por empresa entre activos
CREATE UNIQUE INDEX uq_empleados_tpv_pin_empresa
  ON public.empleados_tpv (empresa_id, pin_hash)
  WHERE activo = true;
```

La tabla `tpv_turnos` también tiene `operador_id UUID REFERENCES empleados_tpv(id) ON DELETE SET NULL` (nullable) y `user_id` fue hecho nullable para soportar turnos abiertos por empleado (sin `auth.users`).

---

## Cookie: `tpv_employee_token`

JWT HS256, audience `'tpv-employee'`, 1h de vida, HttpOnly, SameSite=lax.

Payload:
```json
{
  "empleadoId": "uuid",
  "empresaId": "uuid",
  "nombre": "María García",
  "rol": "cajero"
}
```

- Firmado/verificado en `src/lib/tpv-employee-auth.ts` (`signTpvEmployeeToken`, `verifyTpvEmployeeToken`)
- Clave: `ACCESS_TOKEN_SECRET` (la misma que admin, con audience diferente)
- **Sliding window** (late-window): solo se renueva cuando quedan <15 min. En esa ventana, el proxy llama a DB para verificar `activo = true`. Si está inactivo, NO renueva — el token expira en ≤15 min.

---

## Flujo de autenticación

```
GET /tpv/*
  ├── admin_token válido     → acceso completo (admin)
  ├── tpv_employee_token válido → acceso con permisos según rol
  └── ninguno               → redirect /tpv/login

POST /api/tpv/empleados/login
  → hashPin(pin, empresaId) [PBKDF2 SHA-256, 100k iteraciones, scoped por empresa]
  → empleadoTpvRepository.findActiveByPinHash()
  → signTpvEmployeeToken() → cookie tpv_employee_token
  → redirect /tpv/turno/abrir (o /tpv/mostrador si turno activo)

POST /api/tpv/empleados/logout
  → maxAge=0 en cookie tpv_employee_token
  → redirect /tpv/login
```

### `/tpv/login` bypass en el layout

El TPV layout (`src/app/tpv/layout.tsx`) envuelve TODAS las rutas `/tpv/*`. Para que `/tpv/login` sea accesible sin token, el proxy inyecta `x-pathname` en los headers de página. El layout lee `x-pathname` y hace early return `<>{children}</>` sin verificar cookies.

---

## Proxy (`src/proxy.ts`)

El proxy maneja el dual-auth waterfall para todas las rutas `/tpv/*`:

1. Rutas públicas exactas: `/tpv/login` (GET) + `/api/tpv/empleados/login` (POST) + `/api/tpv/empleados/logout` (POST) → pasan sin verificación
2. Resto de rutas: intenta `admin_token` primero; si falla, intenta `tpv_employee_token`
3. Si ninguno válido → redirect `/tpv/login`

Headers inyectados:
- `x-empresa-id` — empresaId del empleado (igual que admin)
- `x-admin-rol` — rol del empleado (`'cajero'` o `'encargado'`)
- `x-employee-id` — empleadoId (solo en sesión de empleado)
- `x-pathname` — path actual (para bypass de layout en `/tpv/login`)

---

## Permisos por rol

| Feature | Admin | Encargado | Cajero |
|---|---|---|---|
| TPV Mostrador | ✅ | ✅ | ✅ |
| TPV Mesas | ✅ | ✅ | ✅ |
| TPV Cobro | ✅ | ✅ | ✅ |
| TPV Historial | ✅ | ✅ | Solo su turno (futuro — hoy ve todo) |
| TPV Mermas | ✅ | ✅ | ❌ redirect → /tpv/mostrador |
| TPV Cierre de Caja | ✅ (con diferencia) | ✅ (con diferencia) | Arqueo ciego |
| Botón ⚙ (gear) en header | ✅ | ❌ | ❌ |
| Panel admin | ✅ | ❌ redirect → /tpv | ❌ redirect → /tpv |
| Botón "Bloquear TPV" | ❌ | ✅ | ✅ |

### Arqueo ciego para cajero

Cuando `isBlindClose = true` (rol cajero):
- El componente `TurnoCerrarForm` oculta los totales teóricos y la diferencia
- El cajero solo introduce su conteo de efectivo y confirma
- El servidor (`/api/tpv/turno/[id]/cerrar`) calcula el total teórico por su cuenta y guarda la diferencia

---

## TpvRolContext

`src/lib/tpv-rol-context.tsx` expone dos hooks:

```typescript
useTpvRol(): RolAdmin         // 'admin' | 'superadmin' | 'encargado' | 'cajero'
useTpvIsEmployeeSession(): boolean  // true si autenticado via tpv_employee_token (no admin_token)
```

`isEmployeeSession = true` controla la visibilidad del botón "Bloquear TPV" en `TpvHeader`. El layout inyecta ambos valores vía `TpvRolProvider`.

---

## Admin panel: gestión de empleados

Ruta: `/admin/configuracion` → tab "Empleados"

CRUD completo vía `EmpleadosTpvPanel`:
- Listar cajeros/encargados (nombre, rol, estado, fecha)
- Crear (nombre + rol + PIN)
- Cambiar PIN (PATCH)
- Activar/desactivar (PATCH)
- Eliminar (DELETE, solo si sin histórico de turnos)

APIs:
```
GET    /api/admin/empleados-tpv          → lista (sin pinHash)
POST   /api/admin/empleados-tpv          → crear
PATCH  /api/admin/empleados-tpv/[id]     → cambiar PIN o toggle activo
DELETE /api/admin/empleados-tpv/[id]     → borrar
```

Todas requieren `requireRole(['admin', 'superadmin'])`.

**CRÍTICO**: Las respuestas de API nunca devuelven `pinHash`. Se elimina con destructuring antes de serializar.

---

## Archivos clave

| Archivo | Función |
|---------|---------|
| `supabase/migrations/20260708000001_empleados_tpv.sql` | Tabla + índice parcial + RLS + ALTER tpv_turnos |
| `src/core/domain/repositories/IEmpleadoTpvRepository.ts` | Interfaz de dominio |
| `src/core/infrastructure/repositories/supabase-empleado-tpv.repository.ts` | Implementación Supabase |
| `src/lib/tpv-employee-auth.ts` | JWT sign/verify (audience='tpv-employee') |
| `src/core/application/use-cases/tpv/empleado-tpv-login.use-case.ts` | Validación de PIN |
| `src/app/api/tpv/empleados/login/route.ts` | POST login → cookie |
| `src/app/api/tpv/empleados/logout/route.ts` | POST logout → clear cookie |
| `src/app/tpv/login/page.tsx` | Página de login PIN |
| `src/components/tpv/TpvLoginForm.tsx` | Formulario PIN numérico |
| `src/app/tpv/layout.tsx` | Dual-auth + bypass para /tpv/login |
| `src/lib/tpv-rol-context.tsx` | Contexto de rol + isEmployeeSession |
| `src/app/tpv/mermas/layout.tsx` | Gate: cajero → redirect |
| `src/app/tpv/turno/cerrar/page.tsx` | Pasa isBlindClose según rol |
| `src/components/tpv/TurnoCerrarForm.tsx` | Oculta teórico/diferencia si isBlindClose |
| `src/app/api/tpv/turno/[id]/cerrar/route.ts` | Calcula teórico server-side para cajero |
| `src/components/tpv/TpvHeader.tsx` | Gear admin-only, Mermas oculto cajero, Lock button |
| `src/components/tpv/TurnoAbrirForm.tsx` | Nombre pre-filled desde token (readonly si empleado) |
| `src/app/api/admin/empleados-tpv/route.ts` | CRUD raíz |
| `src/app/api/admin/empleados-tpv/[id]/route.ts` | PATCH + DELETE |
| `src/components/admin/EmpleadosTpvPanel.tsx` | UI de gestión de empleados |
| `src/proxy.ts` | Dual-auth waterfall + x-pathname + late-window refresh |

---

## Trampas conocidas

- **`pinHash` nunca en respuestas API**: las rutas admin deben strippear el campo antes de devolver. Ver `({ pinHash: _, ...rest }) => rest`.
- **`user_id` nullable en `tpv_turnos`**: los turnos abiertos por empleado no tienen `user_id`. No asumir que siempre existe.
- **`x-pathname` obligatorio para el bypass**: si se añaden nuevas rutas TPV públicas, deben estar en la lista de públicas del proxy Y el layout debe cubrir el path en el early return.
- **Solo `encargado` puede abrir turno por PIN**: el cajero es redirigido a `/tpv/mostrador` desde `turno/abrir/page.tsx`. Solo admin y encargado pueden abrir.
- **Sliding window es lazy**: el token se renueva SOLO cuando quedan <15 min. No hay renovación en cada request (sin Redis en Vercel serverless).
- **Deactivar un empleado no cierra su sesión al instante**: el gap máximo es el tiempo de vida restante del token (≤1h). El admin puede forzar la desconexión presionando "Bloquear TPV" en el dispositivo o recuperando físicamente el dispositivo.
