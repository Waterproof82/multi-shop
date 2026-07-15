# Patrones de API Admin — multi_shop

Guía de referencia para handlers de las rutas `/api/admin/*`. Aplica Clean Architecture: la ruta no tiene lógica de negocio; solo orquesta auth → use case → respuesta.

---

## `resolveAdminContext()` — helper unificado de auth admin

Definido en `src/core/infrastructure/api/helpers.ts`.

### Qué hace

Ejecuta en orden los 4 pasos obligatorios que toda ruta `/api/admin/*` necesita:

1. **Rate limit** — `rateLimitAdmin(request)` (60 req/min por IP, antes de JWT verify)
2. **JWT verification** — `requireAuth(request)` extrae `empresaId`, `adminId`, `rol` del token verificado
3. **RBAC** — `requireRole(request, ['admin', 'superadmin'])` — rechaza si el rol no es admin ni superadmin
4. **Resolución de tenant** — si `isSuperAdmin` y hay `?empresaId=` en la query, usa ese empresaId (con validación UUID); si no, usa el empresaId del JWT

```typescript
export type AdminContext =
  | { empresaId: string | null; isSuperAdmin: boolean; error: null }
  | { empresaId: null;          isSuperAdmin: boolean; error: NextResponse };

export async function resolveAdminContext(request: NextRequest): Promise<AdminContext>
```

### Patrón de uso (handler típico)

```typescript
export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getMiUseCase().miMetodo(empresaId!);
  return handleResult(result);
}
```

### `isSuperAdmin` — acceso cross-tenant

Para rutas donde el superadmin puede actuar sobre cualquier empresa:

```typescript
const ctx = await resolveAdminContext(request);
if (ctx.error) return ctx.error;
// empresaId ya viene resuelto: jwt.empresaId para admin, queryParam.empresaId para superadmin
const { empresaId } = ctx;
```

No hay que leer `?empresaId` manualmente — `resolveAdminContext` ya lo resuelve con validación UUID.

> **Excepción**: `DELETE /api/admin/pedidos/delete-all` usa `requireRole(['superadmin'])` en lugar de `resolveAdminContext` porque esa ruta solo la puede ejecutar superadmin, no admin.

---

## `handleResult()` — mapeo automático de Result<T> a HTTP

```typescript
export function handleResult<T>(result: Result<T, AppError>): NextResponse
```

Mapea el `Result<T, AppError>` del use case a la respuesta HTTP correcta:

| `error.code` | HTTP status |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `PRODUCT_NOT_FOUND`, `NOT_FOUND` | 404 |
| `AUTH_FORBIDDEN`, `FORBIDDEN`, `AUTH_003` | 403 |
| `AUTH_*` (resto) | 401 |
| `success: true` | 200 con `data` |
| Otros | 500 |

---

## Añadir una nueva ruta `/api/admin/*`

### Checklist

- [ ] Usar `resolveAdminContext(request)` — no duplicar la lógica de auth
- [ ] Usar `safeParse` con Zod — nunca `parse` (lanza excepción) ni `request.json()` sin try/catch
- [ ] Agregar `max()` a todos los string fields del schema Zod
- [ ] Usar `handleResult()` para la respuesta del use case
- [ ] No acceder a DB directamente — siempre vía use case
- [ ] No usar `createClient()` — usar `getSupabaseClient()` o `getSupabaseAnonClient()`
- [ ] No logear emails, teléfonos u otros PII

### Template

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAdminContext, handleResult } from '@/core/infrastructure/api/helpers';
import { getMiUseCase } from '@/core/infrastructure/database';

const bodySchema = z.object({
  nombre: z.string().min(1).max(200).trim(),
});

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await getMiUseCase().crear(empresaId!, parsed.data);
  return handleResult(result);
}
```

---

## Seguridad en endpoints de mesa pública (`/api/mesas/*`)

Las rutas bajo `/api/mesas/[mesaId]/` son públicas (sin JWT de admin). Requieren aislamiento de tenant manual:

```typescript
// 1. Extraer empresaId inyectado por el proxy desde el dominio
const empresaId = request.headers.get('x-empresa-id');
if (!empresaId) return NextResponse.json({ error: 'Tenant no identificado' }, { status: 400 });

// 2. Verificar que la mesa pertenece a este tenant antes de cualquier mutación
const supabase = getSupabaseClient();
const { data: mesa } = await supabase
  .from('mesas')
  .select('id')
  .eq('id', mesaId)
  .eq('empresa_id', empresaId)
  .single();
if (!mesa) return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
```

> Sin este check, un atacante podría mutar datos de mesas de otros tenants conociendo el UUID.

---

## `getMesaOrdersUseCase` — extracción de lógica compleja

Rutas que superan 50–100 líneas de lógica deben extraerse a un use case en `src/core/application/use-cases/`.

**Ejemplo**: `GET /api/mesas/[mesaId]/orders` — originalmente 300+ líneas en la route, ahora en:
- **Route** (`src/app/api/mesas/[mesaId]/orders/route.ts`) — 30 líneas: validación, auth, delegación
- **Use case** (`src/core/application/use-cases/mesa/getMesaOrdersUseCase.ts`) — lógica pura extraída en 5 helpers

El use case usa el sentinel `MESA_TENANT_MISMATCH` (Symbol) para distinguir "sesión no existe" (→ 200 vacío) de "mesa de otro tenant" (→ 404):

```typescript
export const MESA_TENANT_MISMATCH = Symbol('MESA_TENANT_MISMATCH');
export async function getMesaOrdersUseCase(
  mesaId: string,
  empresaId: string,
): Promise<MesaOrdersResult | null | typeof MESA_TENANT_MISMATCH>
```

---

## Constantes de dominio — no hardcodear magic numbers

Definir constantes en `src/core/domain/constants/`:

```typescript
// src/core/domain/constants/pedido.ts
/** 15 min — after this, a payment lock is considered stale and can be overridden */
export const PAYMENT_LOCK_EXPIRY_MS = 15 * 60 * 1000;
```

Usada en: `pedidos/route.ts`, `mesas/[mesaId]/lock/route.ts`, `mesas/[mesaId]/division/route.ts`, `mesas/[mesaId]/orders/route.ts`, `initiateRedsysMesaPaymentUseCase.ts`.
