# Seguridad — multi_shop

Documento de referencia sobre las medidas de seguridad implementadas en el proyecto. Cubre autenticación, autorización, protección de APIs, CSP, rate limiting y validación de inputs.

---

## Autenticación y sesión

### JWT en cookies HttpOnly

El panel admin usa JWT firmados con `ACCESS_TOKEN_SECRET` almacenados en una cookie `admin_token` con los atributos:

- `HttpOnly` — inaccesible desde JavaScript del navegador
- `Secure` — solo se envía por HTTPS en producción
- `SameSite: strict` — protección contra CSRF en navegación cross-site
- `MaxAge: 86400` — expira en 24 horas
- `jti` claim — identificador único por token para revocación

El token incluye `empresaId`, `adminId` y `rol` en el payload.

### Runtime guard para secrets (lazy reads)

Todos los secrets se leen lazily (dentro de funciones, nunca como constantes a nivel de módulo) para evitar capturar `undefined` en build time o en imports tempranos:

| Módulo | Función lazy | Comportamiento si falta |
|--------|-------------|------------------------|
| `auth-admin.use-case.ts` | `getTokenSecret()` | Lanza error — token no se firma |
| `proxy.ts` | `getAdminTokenSecret()` | Retorna 500 al cliente |
| `csrf.ts` | `getCsrfSecret()` | Lanza error — token no se genera |
| `brevo-email.ts` | `getBrevoApiKey()` | Lanza error — email no se envía |
| `s3-client.ts` | `getS3Client()` / `getR2Config()` | Lanza error — upload no procede |
| `unsubscribe-token.ts` | `getSecret()` | Lanza error — token no se genera ni verifica |

```typescript
// Patrón aplicado en todos los módulos con secrets
function getBrevoApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not configured');
  return key;
}
```

### JWT Revocation

Al hacer logout, el `jti` del token se almacena en Upstash Redis con TTL igual al tiempo restante de expiración. La revocación se verifica en dos puntos:

1. **Proxy** (`proxy.ts`): verifica revocación en cada request API antes de permitir acceso
2. **`verifyToken`** (`auth-admin.use-case.ts`): verifica revocación en páginas server-side del admin

Ambos puntos llaman a `isTokenRevoked(jti)` de `src/lib/token-revocation.ts`.

#### Fail-closed en producción

Si Redis no está disponible (caída o mala configuración), `isTokenRevoked` retorna `true` (tratado como revocado) en producción. En desarrollo retorna `false` (fail-open) para conveniencia local:

```typescript
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const config = getRedisConfig();
  if (!config) {
    return process.env.NODE_ENV === 'production';
  }
  try {
    const key = `${REVOCATION_KEY_PREFIX}${jti}`;
    const result = await redisRequest(config, ['EXISTS', key]);
    return result === 1;
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}
```

#### Tokens sin `jti` rechazados (fail-closed)

Tanto el proxy como `verifyToken` rechazan tokens que no incluyan el claim `jti`, en lugar de permitir acceso (fail-open). Un token sin `jti` sería irrevocable permanentemente:

```typescript
// proxy.ts y auth-admin.use-case.ts
if (!payload.jti || await isTokenRevoked(payload.jti)) {
  // 401 — token inválido o revocado
}
```

### Flujo de autenticación

```
Login (POST /api/admin/login)
  → Rate limit: 5 intentos / 15 min por IP (fail-closed en prod si Redis falla)
  → Zod valida credenciales
  → AuthAdminUseCase.login() verifica contra Supabase
  → getTokenSecret() valida que ACCESS_TOKEN_SECRET existe
  → JWT firmado con jti=randomUUID() → cookie admin_token
  → CSRF token generado → cookie csrf_token

Cada request a /api/admin/* (excepto rutas públicas)
  → proxy.ts: rateLimitAdmin (60 req/min por IP) — antes de JWT verification
  → proxy.ts: verifica JWT (firma + expiración)
  → Rechaza si jti ausente o token revocado en Redis
  → Valida CSRF para métodos mutativos (POST/PUT/PATCH/DELETE)
  → Inyecta x-empresa-id, x-admin-id, x-admin-rol en headers
  → requireAuth() lee x-empresa-id para aislar tenant
  → requireRole() verifica rol del admin (handlers mutativos)

Páginas admin server-side
  → AuthAdminUseCase.verifyToken(token)
  → Verifica firma JWT
  → Rechaza si jti ausente o token revocado en Redis (fail-closed en prod)
  → Retorna admin con empresaId o null

Logout (POST /api/admin/logout)
  → Requiere JWT válido + token CSRF (ruta protegida — no en isPublicRoute)
  → Si ACCESS_TOKEN_SECRET falta → 500 (no silencia el fallo)
  → jwtVerify(admin_token) → extrae jti + exp
  → revokeToken(jti, ttlRestante) → Upstash Redis SET key EX ttl
  → Borra admin_token y csrf_token
```

### Rutas públicas (sin autenticación)

Definidas en `isPublicRoute()` dentro de `proxy.ts` con coincidencia exacta (no prefijo):

- `GET /api/admin/login` — obtener CSRF token
- `POST /api/admin/login` — autenticarse
- `GET /api/admin/promociones/unsubscribe` — baja de promociones desde email
- `POST /api/unsubscribe` — baja/alta de promociones (ruta pública)
- `POST /api/csp-report` — recolector de violaciones CSP

> **Nota:** `POST /api/admin/logout` **no** está en rutas públicas — requiere JWT + CSRF para evitar session DoS cross-site. El frontend usa `fetchWithCsrf` al llamar logout.

---

## Control de acceso basado en roles (RBAC)

### `requireRole()` helper

Implementado en `src/core/infrastructure/api/helpers.ts`. Lee el header `x-admin-rol` inyectado por el proxy (extraído del JWT verificado) y retorna 403 si el rol no está en la lista permitida:

```typescript
export function requireRole(request: NextRequest, allowedRoles: string[]): NextResponse | null {
  const role = request.headers.get('x-admin-rol');
  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json(createErrorResponse(AUTH_ERRORS.FORBIDDEN), { status: 403 });
  }
  return null;
}
```

### Aplicación en routes

`requireRole(request, ['admin', 'superadmin'])` se aplica en **todos los handlers mutativos** (POST, PUT, PATCH, DELETE) de las siguientes routes:

| Route | Handlers protegidos |
|-------|-------------------|
| `/api/admin/productos` | POST, PUT, DELETE |
| `/api/admin/categorias` | POST, PUT, DELETE |
| `/api/admin/pedidos` | PUT (stats), PATCH, DELETE |
| `/api/admin/clientes` | POST, PATCH, DELETE |
| `/api/admin/empresa` | PUT |
| `/api/admin/update-colores` | POST |
| `/api/admin/upload-image` | POST |
| `/api/admin/promociones` | POST |
| `/api/admin/pedidos/enviar-email` | POST |

Los handlers GET (solo lectura) no requieren verificación de rol. Los handlers PUT usados como lectura (stats) sí requieren `requireRole` dado que exponen métricas financieras del tenant.

Las rutas `/api/superadmin/*` requieren adicionalmente `rol === 'superadmin'` validado en el proxy antes de llegar al handler:

| Route | Handlers protegidos |
|-------|-------------------|
| `/api/superadmin/empresas` | GET (todas las empresas) |
| `/api/superadmin/empresas/[id]` | GET, PUT |
| `/api/superadmin/switch-empresa` | GET (establece cookie de contexto de tenant) |

### Roles del sistema

La tabla `perfiles_admin` soporta dos roles definidos en `rol TEXT`:

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `admin` | Admin de empresa | Panel `/admin`, solo datos de su tenant |
| `superadmin` | Super Admin | Panel `/superadmin`, acceso global a todas las empresas |

El rol se verifica en:
1. `auth-admin.use-case.ts` - En `verifyToken()`, si `rol === 'superadmin'` no busca empresa asociada (`empresaId: null`)
2. Layout del admin - Redirige a `/superadmin` si el rol es `superadmin`
3. `proxy.ts` - Las rutas `/api/superadmin/*` requieren `rol === 'superadmin'`

### Super Admin Panel

Rutas protegidas (`proxy.ts`):
- `/api/superadmin/empresas` — GET todas las empresas con stats
- `/api/superadmin/empresas/[id]` — GET/PUT empresa específica

Pages:
- `/superadmin` — Dashboard global
- `/superadmin/empresas/[id]` — Editor de empresa

El superadmin tiene acceso a través de `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) para consultar y modificar cualquier empresa.

**APIs admin que soportan superadmin con query param:**

| Route | Handlers | Query param requerido |
|-------|----------|----------------------|
| `/api/admin/empresa` | GET, PUT | `empresaId` |
| `/api/admin/upload-image` | POST | `empresaId` |
| `/api/admin/productos` | GET, POST, PUT, DELETE | `empresaId` |
| `/api/admin/categorias` | GET, POST, PUT, DELETE | `empresaId` |
| `/api/admin/clientes` | GET, POST, PUT, DELETE | `empresaId` |
| `/api/admin/pedidos` | GET, POST, PUT, DELETE | `empresaId` |

El frontend usa `overrideEmpresaId` del context admin para enviar automáticamente el query param cuando hay un superadmin activo.

---

## Protección CSRF

### Mecanismo

Se usa un token HMAC-SHA256 firmado con `CSRF_HMAC_SECRET`. El flujo es:

1. El cliente solicita `GET /api/admin/login` → recibe el token en la respuesta JSON (con `Cache-Control: no-store, private`) y una cookie `csrf_token` con el formato `token:firma`
2. En cada mutación (POST, PUT, PATCH, DELETE), el cliente envía el token en el header `x-csrf-token`
3. El proxy verifica que `x-csrf-token` coincide con el token de la cookie y que la firma HMAC es válida

### Comparación timing-safe

La verificación de la firma usa `crypto.timingSafeEqual` para evitar ataques de temporización:

```typescript
export function verifyCsrfToken(token: string, signature: string): boolean {
  const expectedSignature = signCsrfToken(token);
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  } catch {
    return false;
  }
}
```

### CSRF en rutas de camarero y cocina (`/api/waiter/*`, `/api/kitchen/*`)

Implementado en `proxy.ts` → `handleWaiterAuth`. Mismo patrón double-submit que el admin:

- Métodos mutativos (POST/PUT/DELETE/PATCH): requieren cookie `csrf_token` + header `x-csrf-token`
- GET: exento
- Kitchen hereda el mismo guard porque usa el mismo handler

Códigos de error:
- `403 CSRF_REQUIRED` — header `x-csrf-token` ausente con sesión válida
- `403 CSRF_INVALID` — token presente pero firma HMAC no válida

El frontend waiter obtiene el CSRF token al hacer login (`POST /api/waiter/login`) y lo envía en todas las mutaciones vía `fetchWithCsrf`.

---

## Content Security Policy (CSP)

### Estrategia por capas

- **`next.config.mjs`** define el CSP estático de fallback (para assets estáticos `_next/static`)
- **`proxy.ts`** genera un CSP dinámico con nonce por cada request de página

### Nonce por request

Para cada request de página, el proxy genera un nonce único:

```typescript
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
```

El nonce se inyecta en:
- Header de request `x-nonce` → leído por `layout.tsx` para pasarlo a `ThemeProvider`
- Header de respuesta `Content-Security-Policy` con `'nonce-{nonce}' 'strict-dynamic'` en `script-src`

Next.js propaga automáticamente el nonce a sus propios scripts SSR. En desarrollo se usa `'unsafe-inline' 'unsafe-eval'` porque Turbopack HMR lo requiere.

### Directivas vigentes

| Directiva | Valor |
|-----------|-------|
| `script-src` | `'self' 'nonce-{nonce}' 'strict-dynamic'` (prod) / `'self' 'unsafe-inline' 'unsafe-eval'` (dev) |
| `style-src` | `'self' 'unsafe-inline'` |
| `img-src` | `'self' {R2_DOMAIN} https://*.supabase.co data: blob:` |
| `media-src` | `'self' {R2_DOMAIN}` |
| `font-src` | `'self'` |
| `connect-src` | `'self' https://*.supabase.co https://api.brevo.com https://*.upstash.io` |
| `frame-src` | `'self' https://www.google.com https://maps.google.com` |
| `object-src` | `'none'` |
| `base-uri` | `'self'` |
| `form-action` | `'self'` |
| `frame-ancestors` | `'none'` para rutas `/admin/*` — `'self'` para el resto |
| `report-uri` | `/api/csp-report` |

> `unsafe-eval` solo se incluye cuando `NODE_ENV !== 'production'` — tanto en el CSP dinámico del proxy como en el CSP estático de `next.config.mjs`.
> `{R2_DOMAIN}` se deriva de la variable de entorno `NEXT_PUBLIC_R2_DOMAIN`.

### CSP Violation Reporting

El endpoint `POST /api/csp-report` recibe las violaciones reportadas por los navegadores:

- Rate limitado con `rateLimitPublic` (20 req/min por IP) para evitar log flooding
- Valida el payload con Zod — todos los campos tienen `max()` para prevenir payloads abusivos
- Sanitiza `document-uri` y `blocked-uri` antes de loguear: elimina query string y fragmento para evitar escribir PII (tokens, emails) en los logs
- Registra en `log_errors` con `severity: 'warning'`

```typescript
// Stripping PII de URIs antes de loguear
function sanitizeUri(uri: string | undefined): string | undefined {
  try {
    const parsed = new URL(uri);
    return `${parsed.origin}${parsed.pathname}`; // sin ?query ni #fragment
  } catch { ... }
}
```

### Headers adicionales

Configurados en `next.config.mjs` para todas las rutas:

| Header | Valor |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` (páginas) / `DENY` (admin y API) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=(), usb=()` — `camera=(self)` required for `QRScannerGate` |
| `X-XSS-Protection` | `1; mode=block` |
| `Cache-Control` (API) | `no-store, private` |

---

## Rate Limiting

Implementado con Upstash Redis (`@upstash/ratelimit`). Aplicado en dos niveles:

### Nivel proxy (antes de JWT verification)

`rateLimitAdmin` se ejecuta en `handleAdminAuth` **antes** de `jwtVerify`, evitando que flooding de tokens inválidos sobrecargue el proceso de verificación criptográfica:

```
Request a /api/admin/*
  → rateLimitAdmin (proxy) — primer filtro
  → jwtVerify + revocation check
  → CSRF validation
  → route handler
```

### Nivel handler (defense in depth)

Cada route handler aplica su propio rate limiter como segunda capa:

| Limitador | Rutas | Límite |
|-----------|-------|--------|
| `rateLimitLogin` | `POST /api/admin/login` | 5 intentos / 15 min por IP |
| `rateLimitPublic` | `GET /api/admin/login`, `/api/pedidos`, `/api/unsubscribe`, `/api/csp-report` | 20 req / min por IP |
| `rateLimitAdmin` | Todas las rutas `/api/admin/*` | 60 req / min por IP |
| `rateLimitMesaPolling` | `GET /api/mesas/{mesaId}/orders` | 120 req / min por mesa UUID |
| `rateLimitMesaTokenIssuance` | `POST /api/mesas/{mesaId}/token` | 10 tokens / hora por mesa UUID |

La IP real se extrae del header `cf-connecting-ip` (Cloudflare) con fallback al **primer** entry de `x-forwarded-for` (nunca el último, que sería IP de Cloudflare).

### Fail-closed en login (producción)

Si Redis no está configurado en producción, `rateLimitLogin` devuelve **503** en lugar de permitir intentos ilimitados:

```typescript
if (!limiter) {
  if (FAIL_CLOSED_IN_PRODUCTION) {
    return NextResponse.json(
      { error: "Service temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }
  return null; // dev: skip rate limiting
}
```

Los limitadores `rateLimitPublic` y `rateLimitAdmin` degradan gracefully cuando Redis no está disponible — solo login es fail-closed.

---

## Validación de entorno al startup

El módulo `src/core/infrastructure/env-validation.ts` se ejecuta al iniciar la aplicación vía `src/instrumentation.ts`:

```typescript
export function register() {
  validateEnv();
}
```

### Comportamiento por entorno

- **Producción**: falla con error fatal si faltan variables requeridas
- **Desarrollo**: warnings para variables recomendadas en producción, error en consola para variables siempre requeridas

### Variables validadas

| Variable | Siempre requerida | Solo producción |
|----------|:-:|:-:|
| `ACCESS_TOKEN_SECRET` | ✓ | |
| `CSRF_HMAC_SECRET` | ✓ | |
| `CART_TOKEN_SECRET` | ✓ | |
| `UNSUBSCRIBE_HMAC_SECRET` | | ✓ |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | |
| `UPSTASH_REDIS_REST_URL` | | ✓ |
| `UPSTASH_REDIS_REST_TOKEN` | | ✓ |
| `CORS_ALLOWED_DOMAINS` | | ✓ |

---

## Validación de inputs

### Zod en todas las API routes

Todas las rutas usan `safeParse` (nunca `parse` para evitar excepciones no controladas):

```typescript
const parsed = schema.safeParse(body);
if (!parsed.success) {
  return validationErrorResponse(parsed.error.errors[0].message);
}
```

### try/catch en request.json()

Todas las rutas envuelven `request.json()` en try/catch dedicado — retorna 400 (no 500) con JSON malformado:

```typescript
let body: unknown;
try {
  body = await request.json();
} catch {
  return validationErrorResponse('Invalid request body');
}
```

### Límites por schema

| Schema | Campos principales con límites |
|--------|-------------------------------|
| `POST /api/pedidos` (público) | items max 50, item.name max 200, price max 100k, quantity max 99, complements max 20, telefono regex `^\+?[0-9\s\-()+]+$` max 20 |
| `POST /api/admin/productos` | titulo max 200, descripcion max 2000, foto_url https:// |
| `POST /api/admin/categorias` | nombre max 200, descripcion max 2000 |
| `POST /api/admin/clientes` | nombre max 200, direccion max 500, telefono regex `^\+?[0-9\s\-()+]+$` max 30 |
| `PUT /api/admin/empresa` | email_notification max 254 (RFC 5321), telefono_whatsapp max 30, direccion max 300, descripciones max 1000 |
| `POST /api/admin/promociones` | texto_promocion max 1000, imagen_url https://, max 500 destinatarios por envío |
| `POST /api/admin/pedidos/enviar-email` | items max 50, nombres max 200, precios max 100k |
| `POST /api/csp-report` | blocked-uri max 2000, violated-directive max 500, document-uri max 2000 |

> La regex de teléfono es consistente entre el schema público (`/api/pedidos`) y los DTOs de admin — acepta `+`, dígitos, espacios, guiones y paréntesis.

---

## Seguridad en uploads de imágenes

El endpoint `POST /api/admin/upload-image` aplica:

1. **Validación MIME type** contra lista blanca: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
2. **Validación magic bytes** — verifica la cabecera binaria real del archivo, no solo el MIME declarado
3. **Límite de tamaño**: 10 MB máximo
4. **Path seguro**: nombre del cliente nunca se usa en la ruta R2 — se genera `{slug}/{año}/{mes}/{uuid}.{ext}`
5. **Slug desde DB**: el slug de la empresa se obtiene de la base de datos, nunca del cliente

### Validación de path en deleteImageFromR2

`deleteImageFromR2` en `s3-client.ts` usa `startsWith` + `slice` (en lugar de `replace`) para extraer la key de R2 — evita sustitución parcial si el dominio aparece más de una vez en la URL. Además valida la key resultante con regex antes de enviarla a S3:

```typescript
const prefix = publicDomain.endsWith('/') ? publicDomain : `${publicDomain}/`;
if (!imageUrl.startsWith(prefix)) { return false; }
const key = imageUrl.slice(prefix.length);
if (!key || key.includes('..') || !/^[a-zA-Z0-9_\-/.]+$/.test(key)) { return false; }
```

---

## Anonimización de PII en logs

Ningún dato de identificación personal (email, teléfono) se escribe en texto plano en `log_errors`. Los emails se anonimizan antes de pasar al logger:

```typescript
function anonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain ?? '***'}`;
}
// "usuario@ejemplo.com" → "us***@ejemplo.com"
```

Módulos que aplican esta anonimización: `SupabaseAdminRepository`, `AuthAdminUseCase`, `ClienteUseCase`.

El endpoint `/api/csp-report` también sanitiza URIs antes de loguear (elimina query string para evitar tokens/emails en parámetros).

---

## Prevención de enumeración de usuarios

`POST /api/admin/login` retorna `"Credenciales inválidas"` para todos los tipos de fallo (usuario no encontrado, contraseña incorrecta, usuario no autorizado). Previene que un atacante determine si un email existe en el sistema.

---

## Manejo de errores HTTP

`handleResult()` en `helpers.ts` mapea códigos de error de dominio a status HTTP:

| Error code | HTTP status |
|------------|-------------|
| `VALIDATION_ERROR` | 400 |
| `PRODUCT_NOT_FOUND`, `NOT_FOUND` | 404 |
| `AUTH_003`, `AUTH_FORBIDDEN`, `FORBIDDEN` | 403 |
| `AUTH_*` (resto) | 401 |
| Otros | 500 |

La ruta pública `POST /api/pedidos` intercepta `PRODUCT_NOT_FOUND` y retorna un mensaje genérico (`"Producto no disponible"`) para evitar exponer UUIDs internos.

---

## Principio de mínimo privilegio en endpoints públicos

`POST /api/pedidos` usa `empresaPublicRepository` (clave anon de Supabase) para la consulta de empresa. Las operaciones de escritura usan service role.

---

## Row Level Security (RLS)

RLS está habilitado en todas las tablas de `public`. La app usa `service_role` para escrituras (bypassa RLS) y `anon` para lecturas públicas (respeta RLS).

### Políticas de denegación anónima (RESTRICTIVE)

**Todas** las políticas `No direct anon access to <tabla>` / `No anon access to <tabla>` del schema `public` son `AS RESTRICTIVE FOR ALL TO anon USING (false)`. Las políticas RESTRICTIVE usan lógica AND contra el resto de políticas — garantizan denegación incluso si una política PERMISSIVE (`USING (true)` o similar) concediera acceso, sin importar en qué orden se evalúen ni qué se añada después.

`clientes`, `pedidos`, `perfiles_admin`, `promociones` y `log_errors` ya eran RESTRICTIVE desde una auditoría anterior (rama `security/owasp-audit-july-2026`). El resto del schema (44 tablas más — `mesa_sesiones`, `pedido_item_estados`, `tpv_cobros`, `lc_fichajes*`, `empleados_tpv`, tablas de compras/proveedores, etc.) usaba PERMISSIVE hasta el 2026-07-31, tras un incidente que expuso el motivo: ver más abajo.

### Incidente 2026-07-31 — fuga cross-tenant vía RLS PERMISSIVE + Realtime

La migración `20260627000001_realtime_anon_select_policies.sql` añadió policies `USING (true)` para `anon` en `pedidos`, `mesa_sesiones` y `pedido_item_estados`, con la intención de que Realtime `postgres_changes` llegara a suscriptores `anon`. El problema: una policy RLS permisiva también abre la tabla a lectura directa vía PostgREST (`GET /rest/v1/pedidos?select=*`) — cualquiera con la `anon key` pública podía leer pedidos de **todas** las empresas (dirección de entrega, coordenadas GPS, contenido y total de cada pedido).

`pedidos` tenía además, desde antes, una policy `"Anon puede leer pedido por tracking_token"` (`USING (tracking_token IS NOT NULL)`) — quedó neutralizada por la RESTRICTIVE deny-all al arreglar esto, y es código muerto: el tracking de pedidos siempre pasó por rutas server-side con `service_role`, nunca por REST directo con `anon`. Se dejó documentada, no se eliminó.

Al mismo tiempo se encontró un segundo patrón, más sutil, en `categorias`/`clientes`/`empresas`/`mesas`/`pedidos`/`productos`: policies "Admin ..." con `roles: public` (que incluye `anon`) cuyo `USING`/`WITH CHECK` llama a `get_mi_empresa_id()` — función accesible solo por `authenticated`. Postgres evalúa **todas** las policies permisivas aplicables a un rol; al volverse `anon` elegible para esa evaluación (tras un cambio de GRANT en otro punto), la función lanzaba `permission denied` en vez de una denegación limpia. No era una fuga (el acceso seguía denegado), pero es un modo de fallo frágil y no determinista. Se corrigió re-escopeando esas policies a `TO authenticated` (su intención real). El mismo patrón, con `auth.uid()` en vez de `get_mi_empresa_id()`, apareció en `perfiles_admin`/`promociones` — `auth.uid()` no lanza error para `anon` (devuelve `NULL` limpio), así que ahí no había ni siquiera el riesgo de fallo frágil, pero se corrigió igual por consistencia.

**Fix aplicado** (migraciones `20260731000002` a `20260731000012`):
1. Mitigación táctica inmediata: `REVOKE`/`GRANT` de columna para restringir `anon` a las columnas mínimas necesarias en las 3 tablas.
2. Migración de las señales de Realtime hacia `anon` de `postgres_changes` a **Broadcast** (`realtime.send()` desde triggers dedicados, payload mínimo sin PII) — ver [`realtime-channels.md`](./realtime-channels.md).
3. Eliminación total de las 3 policies `USING (true)`.
4. Re-escopeo de las 6+2 policies `roles:public` a `authenticated`.
5. Conversión sistémica de las 46 policies "no anon access" restantes de PERMISSIVE a RESTRICTIVE en todo el schema — la corrección de la causa raíz, no solo de los síntomas encontrados.

### Función de auditoría — `check_rls_policy_hygiene()`

`SECURITY DEFINER`, solo accesible con `service_role` (mismo patrón que `check_public_function_grants()` más abajo). Escanea `pg_policies` completo y devuelve violaciones de 4 tipos:

- `permissive_anon_deny` — un "no anon access" que sea PERMISSIVE en vez de RESTRICTIVE
- `public_role_identity_scoped_fn` — una policy `roles:public` que llama `get_mi_empresa_id()` o `auth.uid()`
- `public_role_blanket_true` — una policy `roles:public` con `USING`/`WITH CHECK (true)` fuera de la whitelist de catálogo público (`categorias`, `empresas`, `productos`). Cierra el mismo hueco que dejó "Public can select idioma": una RESTRICTIVE deny-all solo protege a `anon`, nunca a `authenticated` — este patrón puede filtrar PII cross-tenant a cualquier sesión autenticada sin que ninguna otra policy lo evite.
- `rls_disabled` — una tabla de `public` sin RLS habilitado
- `view_missing_security_invoker` — una `VIEW` (o vista materializada) sin `security_invoker = true`. Sin ese flag, la vista corre con los privilegios de quien la creó, no de quien la consulta — puede saltarse RLS de las tablas subyacentes por completo, el mismo riesgo que una función `SECURITY DEFINER` sin `REVOKE`. No hay vistas en `public` a día de hoy (verificado con una vista de prueba: el chequeo la detectó correctamente antes de eliminarla), pero queda activo para la primera que se cree sin que quien la escriba conozca esta trampa. Las vistas materializadas no tienen modo invoker — cualquiera expuesta a `anon`/`authenticated` cae aquí siempre.

Cubierta por `e2e/compliance/rls-policy-hygiene.spec.ts` (corre en CI en cada push/PR que toque `supabase/migrations/**`, ver [`testing-ci.md`](./testing-ci.md)). Cualquier tabla nueva que reintroduzca alguno de estos dos patrones hace fallar el test — no hace falta acordarse de revisarlo a mano.

### Función de auditoría — `check_public_function_grants()`

Escanea `information_schema.role_routine_grants` para **toda** función no-trigger del schema `public` (antes `check_security_definer_grants()`, que solo cubría `SECURITY DEFINER` — renombrada y ampliada el 2026-07-31). Las funciones de trigger quedan excluidas del escaneo: Postgres rechaza invocarlas fuera de un trigger sin importar el GRANT, así que no son explotables vía RPC.

**Incidente BAJA-01 follow-up (2026-07-31):** el audit de seguridad del 2026-07-30 (BAJA-01) ya había identificado y revocado `acquire_mesa_lock`, `claim_and_create_division_pago` y `claim_custom_turn` — funciones `SECURITY INVOKER` de la familia de pago por turnos personalizados, expuestas sin necesidad vía `/rest/v1/rpc/*`. Al ampliar el escaneo más allá de `SECURITY DEFINER`, aparecieron 6 funciones hermanas de la misma familia que esa pasada no cubrió: `cancel_custom_turn`, `commit_custom_payment`, `complete_custom_payment`, `switch_to_equal_split_remaining`, `update_custom_selection`, `get_next_pedido_number`. Verificado en vivo: el daño real ya estaba mitigado por RLS (RESTRICTIVE deny-all en `mesa_pagos_personalizados`/`mesa_item_pagos`/`mesa_sesiones`/`pedidos` — llamarlas como `anon` con un UUID real o falso devuelve el mismo `TURNO_NOT_FOUND`, sin distinguir), pero depender solo de RLS como única capa para un RPC de mutación de pagos directamente invocable es exactamente la exposición innecesaria que BAJA-01 ya había decidido cerrar. Las 6 se usan exclusivamente server-side con `service_role` (`src/core/application/use-cases/payment/*`) — revocadas con el mismo patrón.

Cubierta por `e2e/compliance/supabase-security-definer.spec.ts` (capa 1: intento directo; capa 2: escaneo completo).

**Limpieza de las 14 funciones de trigger excluidas del escaneo (auditoría externa, 2026-07-31):** el escaneo excluye a propósito las funciones `RETURNS TRIGGER` porque Postgres las rechaza si se invocan fuera de un trigger, sin importar el GRANT — no son explotables vía RPC. Aun así, 14 de ellas (`block_albaran_alteration`, `block_albaran_deletion`, `lc_fichajes_chain_verify_after`, `push_on_item_estado`, `push_on_pedido_validated`, `tpv_cobro_block_delete`, `tpv_turno_assign_numero_z`, `tpv_turno_auto_audit_events`, `tpv_turno_before_insert`, `tpv_turno_block_delete`, `tpv_turno_block_update_fields`, `tpv_turno_evento_block_delete`, `tpv_turno_evento_block_update`, `trigger_fn_recalcular_cmp`) tenían `EXECUTE` otorgado a `PUBLIC` (heredado por `anon`/`authenticated`) sin necesitarlo. Antes de revocarlo se verificó en vivo, con una tabla/función/trigger descartables dentro de una transacción con `ROLLBACK`, que Postgres **no** comprueba el privilegio `EXECUTE` del rol que dispara la sentencia al ejecutar un trigger — solo lo comprueba en invocación directa (que ya está bloqueada por otro motivo). Revocado en `20260731000020`. No se agregó un chequeo de regresión para esto: es higiene de mínimo privilegio sobre una ruta ya probada como no explotable, no una vulnerabilidad — mantener infraestructura de escaneo para un riesgo teórico y ya cerrado no se justifica.

### Causa raíz encontrada — `ALTER DEFAULT PRIVILEGES` en `public` (2026-07-31, tercera pasada)

Tras el hallazgo de las 6 RPCs `SECURITY INVOKER` expuestas, la pregunta que realmente importaba no era "¿arreglé todas las instancias?" sino "¿qué mecanismo produce este patrón una y otra vez?". La respuesta: el schema `public` tenía `ALTER DEFAULT PRIVILEGES` configurado (por los roles `postgres` y `supabase_admin`, probablemente heredado del bootstrap del proyecto anterior a que Supabase hiciera obligatorios los grants explícitos en octubre de 2026) que otorgaba automáticamente a `anon`/`authenticated` **acceso completo a toda tabla, función o secuencia NUEVA** — `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` en tablas, `EXECUTE` en funciones, `SELECT/UPDATE/USAGE` en secuencias.

Esto explica el patrón detrás de **todos** los incidentes de hoy: cada tabla y función nueva nacía expuesta por defecto, y solo quedaba protegida si alguien se acordaba de revocarlo explícitamente. No es que el equipo se haya olvidado varias veces — es que el schema estaba configurado para que olvidarse fuera el comportamiento por defecto.

**Fix** (migración `20260731000017`): `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ... FROM anon, authenticated` en tablas, funciones y secuencias. `postgres` es el rol con el que corren todas las migraciones de este proyecto (CLI, MCP, editor SQL del dashboard) — verificado en vivo creando una tabla de prueba después del fix: heredó privilegios solo para `postgres`/`service_role`, ninguno para `anon`/`authenticated`. Cambia la postura de seguridad de raíz: de "inseguro por defecto, seguro si alguien se acuerda de revocar" a "sin acceso por defecto, accesible si alguien se acuerda de otorgar" — coincide exactamente con lo que el checklist de migraciones de `CLAUDE.md` ya asumía ("GRANTs explícitos obligatorio desde oct 2026") pero que hasta ahora no se cumplía a nivel de base de datos.

**Limitación conocida:** los privilegios por defecto del rol `supabase_admin` sobre `public` **no se pudieron revocar** — `REVOKE`/`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` devuelve `permission denied` (`postgres` no es miembro de `supabase_admin` en el hosting gestionado de Supabase; ese rol es superusuario reservado para el bootstrapping interno de la plataforma). No es explotable en la práctica — ningún flujo de trabajo real del proyecto crea objetos como `supabase_admin` — pero queda documentado y en la whitelist del test (`INTENTIONAL_DEFAULT_PRIVILEGE_GRANTORS` en `rls-policy-hygiene.spec.ts`) en vez de ignorado silenciosamente. Si algún día se necesita cerrarlo del todo, requiere contactar soporte de Supabase o acceso a un rol con membresía en `supabase_admin`.

Cubierto por el chequeo `default_privileges_grant_anon` de `check_rls_policy_hygiene()` — detecta si esto se vuelve a otorgar (por cualquier rol) sin que nadie tenga que acordarse de revisar `pg_default_acl` a mano.

### Otros defaults inseguros de Postgres cubiertos (misma meta-revisión)

La pregunta "¿qué otro objeto de Postgres tiene un default inseguro que nadie audita?" dio 3 hallazgos más, los 3 verificados en vivo con objetos de prueba descartables antes de confirmarlos como chequeos permanentes de `check_rls_policy_hygiene()`:

- **`security_definer_missing_search_path`** — una función `SECURITY DEFINER` sin `SET search_path` es vulnerable a *schema hijacking*: un atacante con permiso de `CREATE` en algún schema del `search_path` del caller puede sombrear referencias sin cualificar que la función usa internamente, y ejecutar código propio con los privilegios elevados de la función. Limpio hoy — 0 funciones sin `search_path` en `public`.
- **`bypassrls_unexpected_role`** — un rol con `rolbypassrls = true` se salta RLS por completo, sin importar cómo estén configuradas las policies. Limpio hoy — solo los roles estándar de Supabase (`service_role`, `supabase_admin`, `postgres`, etc.) lo tienen.
- **`insert_policy_missing_with_check`** — una policy `FOR INSERT` sin `WITH CHECK` explícito equivale a `WITH CHECK (true)` — inserción sin ninguna restricción. Limpio hoy — 0 policies de este tipo.

### Cuarta pasada (auditoría externa, 2026-07-31) — GRANTs heredados en las 53 tablas ya existentes

Una auditoría de seguridad externa hizo la pregunta que las tres pasadas anteriores no hicieron: *"¿el GRANT de tabla que hay debajo de cada policy sigue siendo necesario, o solo estamos auditando si la policy que lo restringe está bien escrita?"*. Los 9 checks de `check_rls_policy_hygiene()` hasta ese momento (`permissive_anon_deny`, `public_role_identity_scoped_fn`, `public_role_blanket_true`, `rls_disabled`, `view_missing_security_invoker`, `default_privileges_grant_anon`, `security_definer_missing_search_path`, `bypassrls_unexpected_role`, `insert_policy_missing_with_check`) auditan todos la **forma de las policies de RLS**. Ninguno pregunta si el **GRANT de tabla** subyacente debería existir.

Verificado en vivo: las **53 tablas** de `public` tenían `anon` con `INSERT, UPDATE, DELETE, TRUNCATE` a nivel de tabla completa — herencia del mismo `ALTER DEFAULT PRIVILEGES` que motivó el fix de `20260731000017`. Ese fix revoca los privilegios por defecto para objetos **nuevos**, pero nunca tocó retroactivamente los GRANTs ya otorgados sobre tablas que existían antes de aplicarlo. El resultado: el fix cerró la fuga hacia adelante y dejó exactamente el mismo patrón sin corregir hacia atrás, en el 100% de las tablas preexistentes.

**Por qué esto importa más que "RLS ya lo bloquea":** RLS en Postgres se aplica a `SELECT`/`INSERT`/`UPDATE`/`DELETE`. **`TRUNCATE` no está sujeto a ninguna policy**, `RESTRICTIVE` o no — es una limitación del motor, no un defecto de esta app. Los triggers de inalterabilidad (`pedidos_no_delete`, `tpv_cobro_no_delete`, `lc_fichajes_immutable`) tampoco lo capturan: están definidos `BEFORE DELETE`/`BEFORE UPDATE`, no `BEFORE TRUNCATE`. Es decir: de los cuatro privilegios revocados, tres (`INSERT`/`UPDATE`/`DELETE`) ya estaban neutralizados en la práctica por las policies `RESTRICTIVE "No direct anon access"` — pero `TRUNCATE` no tenía ninguna capa que lo frenara.

**Explotabilidad verificada hoy:** ninguna. `anon`/`authenticated` tienen `rolcanlogin = false` (confirmado con `pg_roles`) — solo `authenticator` puede abrir sesión y hace `SET ROLE` según el JWT. PostgREST tampoco traduce ningún verbo HTTP a `TRUNCATE`. No hay ruta de red hoy. Pero es una violación de defensa en profundidad real y del propio checklist de migraciones de `CLAUDE.md` ("GRANT SELECT... TO anon <- solo si tabla publica") — y basta una función `SECURITY DEFINER` futura con SQL dinámico, o repetir el patrón de GRANTs en una tabla nueva sin pasar por el flujo estándar, para que dejara de ser teórico.

**Fix** (`20260731000019`):
1. `DO $$ ... $$` que recorre `pg_class` de `public` (tablas ordinarias y particionadas) y revoca `INSERT, UPDATE, DELETE, TRUNCATE` de `anon` en cada una — bucle dinámico, no lista de tablas hardcodeada, mismo criterio que el resto de checks de `check_rls_policy_hygiene()` (una tabla nueva queda cubierta sin tocar el código de nuevo).
2. Nuevo check `anon_write_grant`, **sin whitelist**: la arquitectura del proyecto es `anon` = solo lectura vía RLS, `service_role` = todas las escrituras (ver "Row Level Security" más abajo) — no existe ninguna tabla donde `anon` deba tener estos 4 privilegios, a diferencia de `public_role_blanket_true` que sí tiene 3 tablas de catálogo público como excepción legítima.

**Alcance deliberadamente limitado a `anon`:** `authenticated` no se tocó. El modelo de RLS del proyecto depende de que `authenticated` pueda hacer DML real bajo policies con scope de tenant (`empresa_id = get_mi_empresa_id()`), verificado extensamente en `pg_policies` — revocar ahí requiere su propia pasada de auditoría, no un revoke masivo el mismo día.

Cubierto por el test `ninguna tabla otorga a anon INSERT/UPDATE/DELETE/TRUNCATE a nivel de tabla` en `rls-policy-hygiene.spec.ts`.

### Superficies verificadas sin hallazgos (2026-07-31, segunda pasada)

Tras encontrar el hueco de RPCs `SECURITY INVOKER` de arriba, se revisaron otras superficies del mismo tipo (¿qué otra cosa tiene un default inseguro que nadie audita sistemáticamente?) — resultado limpio, documentado para no repetir la revisión sin motivo:

- **Vistas** (`CREATE VIEW`) — ninguna existe en `public` hoy. Ver `view_missing_security_invoker` más abajo: queda un chequeo permanente para la primera que se cree.
- **Supabase Storage** — el bucket `app-releases` (distribución del APK Android) es privado, con una única policy en `storage.objects` scopeada a `service_role` para todos los comandos. `anon`/`authenticated` no tienen ninguna policy — deny-all por ausencia.
- **Secuencias** — `pedidos_numero_pedido_seq`, `lc_fichajes_chain_seq`, `rgpd_purge_log_id_seq` tienen `USAGE` (no `SELECT`) para `anon`/`authenticated`. `USAGE` solo habilita `nextval()` para INSERTs propios — no permite leer el valor actual vía REST (PostgREST no expone secuencias como recurso). Sin riesgo de fuga de volumen de negocio.
- **Schema `vault`** (Supabase Vault, secrets encriptados) — `anon`/`authenticated` no tienen ni `USAGE` sobre el schema, verificado con `has_schema_privilege`. Inaccesible por completo. No se usa en el proyecto actualmente.
- **Funciones que referencian `auth.users`** — ninguna en `public`. Sin vector de fuga de emails de admins vía una función/vista intermedia.

### Lecturas públicas

`categorias`, `productos` y `empresas` tienen políticas SELECT `qual=true` para `anon` — necesarias para el menú público. Las operaciones de escritura (INSERT/UPDATE/DELETE) están restringidas por `get_mi_empresa_id()`.

### RLS e `auth.uid()` en políticas

Las políticas de `perfiles_admin` y `promociones` usan `(SELECT auth.uid())` (con SELECT) en lugar de `auth.uid()` directo para evitar re-evaluación por fila y mejorar el rendimiento de los planes de query.

### RLS en particiones de fichajes (`lc_fichajes_2026_*`)

Las tablas de partición de fichajes **no heredan RLS del padre** — cada partición necesita `ENABLE ROW LEVEL SECURITY` propio con sus políticas.

Políticas por partición (migración `20260725000001`):
- `anon DENY ALL` — ningún acceso sin autenticar
- `admin SELECT` — solo admins del tenant vía `get_mi_empresa_id()`
- `service_role SELECT` — acceso internal

La función `lc_create_next_partition()` aplica RLS automáticamente en toda partición nueva con `EXECUTE format()` — no requiere intervención manual.

---

## Funciones SECURITY DEFINER — Trampas Críticas

### REVOKE FROM PUBLIC, no FROM anon

En Postgres, `anon` no tiene un grant explícito — hereda EXECUTE de `PUBLIC`. Hacer `REVOKE EXECUTE FROM anon` no tiene efecto si `PUBLIC` sigue teniendo el grant.

La secuencia correcta para proteger una función SECURITY DEFINER:

```sql
-- 1. Eliminar el grant heredado por anon (y por cualquier rol sin grant explícito)
REVOKE EXECUTE ON FUNCTION public.mi_funcion() FROM PUBLIC;

-- 2. Re-otorgar solo a los roles que necesitan acceso directo
GRANT EXECUTE ON FUNCTION public.mi_funcion() TO service_role;
-- (solo si la función es llamable por usuarios autenticados vía RPC):
-- GRANT EXECUTE ON FUNCTION public.mi_funcion() TO authenticated;
```

Para verificar el estado actual de grants:

```sql
SELECT p.proname, unnest(p.proacl)::text AS acl_entry
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'mi_funcion';
-- `=X/postgres` = PUBLIC grant (anon lo hereda) — debe desaparecer tras el REVOKE
```

### Funciones de trigger vs. funciones RPC

Las funciones de trigger (RETURNS TRIGGER) nunca deben ser llamables por usuarios finales via RPC. REVOKE FROM PUBLIC **y** FROM authenticated:

```sql
REVOKE EXECUTE ON FUNCTION public.mi_trigger_fn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_trigger_fn() FROM authenticated;
```

Las funciones RPC llamadas desde API routes con `getSupabaseClient()` (service_role): REVOKE FROM PUBLIC y FROM authenticated; el servicio_role mantiene su GRANT y PostgREST lo usa correctamente.

### `get_mi_empresa_id()` — excepción intencional

Esta función SECURITY DEFINER es accesible por `authenticated` por diseño — es llamada directamente desde cláusulas `USING` de RLS policies. Moverla o revocarle acceso a authenticated rompería el aislamiento de tenant en todas las tablas que la usan.

### `SET search_path` y pgcrypto en Supabase

En Supabase, pgcrypto no vive en `pg_catalog` sino en el schema `extensions`. Toda función que use `digest()` (u otras funciones de pgcrypto) **debe** incluir `extensions` en su `search_path`:

```sql
CREATE OR REPLACE FUNCTION public.mi_funcion()
...
SET search_path = public, extensions, pg_catalog
AS $func$ ... $func$;
```

Con `SET search_path = public, pg_catalog` (sin `extensions`), el error en runtime es:
```
function digest(bytea, unknown) does not exist
```

El `search_path` del caller **no se hereda** por el callee — cada función PL/pgSQL resuelve nombres en su propio scope.

Para verificar en qué schema viven las funciones de pgcrypto:
```sql
SELECT n.nspname, p.proname
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'digest';
-- → extensions
```

---

## Endpoint de desarrollo protegido en producción

`DELETE /api/admin/pedidos/delete-all` — usado solo en desarrollo para limpiar datos de prueba. Tiene un guard fail-fast en la primera línea del handler:

```typescript
if (process.env.NODE_ENV === 'production') {
  return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
}
```

El endpoint existe para conveniencia en desarrollo pero nunca debe ejecutarse en producción.

---

## CRON_SECRET — comparación en tiempo constante

Todos los endpoints `GET /api/cron/*` y `GET /api/laborcontrol/cron/*` verifican el header `Authorization: Bearer <CRON_SECRET>` a través del helper compartido `verifyCronSecret()` en `src/lib/cron-auth.ts`, que usa `timingSafeEqual` en vez de comparación de string directa (`!==`). Comparar strings con `!==` filtra timing information proporcional a los bytes que coinciden — evitable a coste cero.

```typescript
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
```

El test estático `tests/compliance/cron-secret-timing-safe.test.ts` falla si algún endpoint nuevo lee `CRON_SECRET` sin pasar por este helper.

---

## Tests E2E — suite de seguridad

`e2e/waiter-csrf.spec.ts` — tests Playwright en modo API (sin browser) que verifican:

| Test | Qué valida |
|------|-----------|
| `POST sin waiter_token` → 401 | Auth check funciona |
| `GET /api/waiter/me sin csrf` → no 403 | GET exento de CSRF |
| `POST con waiter_token sin csrf` → 403 | CSRF_REQUIRED |
| `POST con csrf inválido` → 403 | CSRF_INVALID |
| `POST /api/kitchen/*` → 401/403 | Kitchen hereda el guard |
| RLS `lc_fichajes_2026_07` anon | PostgREST devuelve 0 filas o 404 |
| RLS `lc_fichajes_2026_08` anon | PostgREST devuelve 0 filas o 404 |

`e2e/compliance/anon-realtime-column-privileges.spec.ts` — verifica que `anon` nunca puede leer `select=*` ni columnas sensibles de `pedidos`/`mesa_sesiones`/`pedido_item_estados`, y que las columnas mínimas otorgadas siempre devuelven 0 filas (RLS). Regresión dedicada al incidente 2026-07-31 de más arriba.

`e2e/compliance/rls-policy-hygiene.spec.ts` — escanea **todo** el schema (no solo las tablas del incidente) buscando los dos patrones RESTRICTIVE/`roles:public` descritos arriba. Ver detalle completo en [`testing-ci.md`](./testing-ci.md).

Configuración en `playwright.config.ts`. Para ejecutar:

```bash
# Con servidor ya corriendo:
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/waiter-csrf.spec.ts

# Con servidor en variables de Supabase (RLS tests):
PLAYWRIGHT_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx playwright test e2e/waiter-csrf.spec.ts
```

Los tests 4 y 5 (CSRF con token válido) requieren `PLAYWRIGHT_WAITER_TOKEN` — se omiten con skip si no está definido.

---

## JSON-LD Sanitization

El componente `json-ld.tsx` sanitiza datos antes de insertar en `<script type="application/ld+json">`:

```typescript
function safeJsonStringify(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replaceAll(String.raw`<`, String.raw`\u003c`)
    .replaceAll(String.raw`>`, String.raw`\u003e`)
    .replaceAll(String.raw`&`, String.raw`\u0026`);
}
```

---

## Cart Access Token

El proxy valida cart tokens (`?access=` query param) con `CART_TOKEN_SECRET` y requiere `aud: 'cart-access'` para prevenir token confusion con admin JWTs.

Si `CART_TOKEN_SECRET` no está en producción, el proxy retorna **500** en lugar de ignorar el token y conceder acceso.

Cuando se implemente la generación de cart tokens:

```typescript
new SignJWT({ /* claims */ })
  .setProtectedHeader({ alg: 'HS256' })
  .setAudience('cart-access')
  .setExpirationTime('15m')
  .sign(new TextEncoder().encode(process.env.CART_TOKEN_SECRET));
```

---

## Multi-tenant — dominio parsing

`parseMainDomain()` usa `endsWith('-pedidos')` (no `includes`) para el sufijo de pedidos, evitando falsos positivos.

### Aislamiento multi-tenant

- El proxy extrae `empresaId` del JWT e inyecta `x-empresa-id` en headers
- `requireAuth()` lee ese header — imposible de falsificar sin JWT válido
- Todos los repositorios filtran por `empresaId` en cada query
- Update y delete usan filtro compuesto: `.eq("id", id).eq("empresa_id", empresaId)`

---

## Protección contra XSS en emails

Todo el contenido de usuario insertado en HTML de emails pasa por `escapeHtml()`:

```typescript
textoEscapado: escapeHtml(texto_promocion),
```

El módulo `brevo-email.ts` usa el logger centralizado y no loguea emails de destinatarios — solo status HTTP y número de recipientes.

---

## Price Tampering Protection

`PedidoUseCase.create` recalcula el total desde precios reales de DB — el total del cliente se ignora. Si un producto enviado por el cliente no existe en DB, el pedido se rechaza con `PRODUCT_NOT_FOUND`:

```typescript
if (pid && !priceMap.has(pid)) {
  return { success: false, error: { code: 'PRODUCT_NOT_FOUND', ... } };
}
```

---

## Unsubscribe Tokens

HMAC-SHA256 con `UNSUBSCRIBE_HMAC_SECRET` (secret dedicado, aislado de `CSRF_HMAC_SECRET`) y TTL de **1 año** para cumplimiento GDPR/CAN-SPAM — los links de baja en emails promocionales deben funcionar a largo plazo.

Cada destinatario recibe su token individual al enviar una promoción. El token incluye email, empresaId, acción y expiry en el payload firmado.

```
generateUnsubscribeToken(email, empresaId, 'baja') → "{expiry}.{hmac}"
verifyUnsubscribeToken(token, email, empresaId, 'baja') → boolean
```

- El endpoint `/api/unsubscribe` acepta `action` (`alta`/`baja`) con validación de enum explícita
- El endpoint `/api/admin/promociones/unsubscribe` usa siempre `action='baja'` (solo da de baja)

---

## CORS

Configurado en el proxy para todas las rutas `/api/*`. Solo orígenes en:

- `CORS_ALLOWED_ORIGINS` — lista exacta con protocolo
- `CORS_ALLOWED_DOMAINS` — dominios y subdominios (sin protocolo)
- `http://localhost:*` — permitido automáticamente en desarrollo

`Vary: Origin` en todas las respuestas para evitar cache poisoning.

---

## UI/Accessibility Security

- **Touch targets**: mínimo 44×44px (`min-h-[44px] min-w-[44px]`)
- **ARIA compliance**: toggles con `role="switch"` + `aria-checked`
- **Focus rings**: `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Reduced motion**: `useReducedMotion()` y `motion-reduce:` en todas las animaciones
- **i18n en ARIA**: todos los `aria-label` usan `t()` — sin texto hardcodeado en un solo idioma
- **Contraste WCAG AA**: mínimo 4.5:1 en todos los textos

---

## Variables de entorno requeridas

| Variable | Uso | Validación startup |
|----------|-----|--------------------|
| `ACCESS_TOKEN_SECRET` | Firma JWT de sesión admin | ✓ Siempre |
| `CSRF_HMAC_SECRET` | Firma HMAC de tokens CSRF | ✓ Siempre |
| `CART_TOKEN_SECRET` | JWT de acceso al carrito | ✓ Siempre |
| `UNSUBSCRIBE_HMAC_SECRET` | HMAC tokens de baja/alta promociones | ✓ Producción |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase | ✓ Siempre |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase | ✓ Siempre |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service role de Supabase | ✓ Siempre |
| `UPSTASH_REDIS_REST_URL` | Rate limiting + JWT revocation | ✓ Producción |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting + JWT revocation | ✓ Producción |
| `CORS_ALLOWED_DOMAINS` | Dominios permitidos en CORS | ✓ Producción |
| `BREVO_API_KEY` | Envío de emails transaccionales | warn Producción |
| `BREVO_DEFAULT_SENDER_EMAIL` | Remitente por defecto | warn Producción |
| `R2_ACCOUNT_ID` | Cloudflare R2 storage | warn Producción |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 storage | warn Producción |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 storage | warn Producción |
| `R2_BUCKET_NAME` | Cloudflare R2 storage | warn Producción |
| `NEXT_PUBLIC_R2_DOMAIN` | Dominio público de imágenes R2 | warn Producción |
| `CORS_ALLOWED_ORIGINS` | Lista exacta de orígenes CORS | — |
| `CLOUDFLARE_API_TOKEN` | Upload directo vía Cloudflare API | — |

---

## Mesa Client Tokens

Token-based physical presence enforcement for dine-in ordering. See [`qr-session-enforcement.md`](./qr-session-enforcement.md) for the full feature documentation.

### `mesa_client_tokens` table

```sql
id          uuid PRIMARY KEY
mesa_id     uuid NOT NULL REFERENCES mesas(id) ON DELETE CASCADE
sesion_id   uuid NOT NULL REFERENCES mesa_sesiones(id) ON DELETE CASCADE
token       text NOT NULL UNIQUE   -- cryptographically random, base64url
expires_at  timestamptz NOT NULL   -- issued_at + 20 minutes
```

RLS: `anon` access explicitly denied (RESTRICTIVE policy). `service_role` has full access via explicit GRANT.

### Validation middleware

`validateMesaClientToken(request)` in `src/core/infrastructure/api/validate-mesa-client-token.ts` is applied before all mesa order endpoints:
- Reads `Authorization: Bearer {token}`
- Queries `mesa_client_tokens JOIN mesa_sesiones` — checks `expires_at > now()` AND `cerrada_at IS NULL`
- Returns `401` with code `TOKEN_EXPIRED` or `SESSION_CLOSED` on failure

Session rotation on waiter close (`POST /api/waiter/mesas/{mesaId}/close`) immediately reopens the session. All tokens tied to the previous session fail validation because `cerrada_at IS NULL` is no longer true.

### Rate limiter

`rateLimitMesaTokenIssuance`: `slidingWindow(10, "1 h")` — 10 tokens/hour per mesa UUID. Prefix: `ratelimit:mesa-token`.

### Camera permission

`next.config.mjs` sets `Permissions-Policy: camera=(self)` — required for `QRScannerGate` (`@zxing/browser`) to access the device camera. Without this, the browser would throw `NotAllowedError` even if the user grants camera permission.

---

## resolveAdminContext() — helper unificado de admin auth

Ver doc completo: [`admin-api-patterns.md`](./admin-api-patterns.md).

`resolveAdminContext()` en `src/core/infrastructure/api/helpers.ts` consolida los 4 pasos de auth que todas las rutas `/api/admin/*` comparten:

1. Rate limit (antes de JWT verify)
2. JWT verification + extracción de claims
3. RBAC: `requireRole(['admin', 'superadmin'])`
4. Resolución de tenant: `empresaId` del JWT para admins normales; `?empresaId=` validado por UUID para superadmins

```typescript
const ctx = await resolveAdminContext(request);
if (ctx.error) return ctx.error;
const { empresaId } = ctx;
```

**33 rutas admin migradas** a este helper. Antes de esta refactorización, la validación de `?empresaId` para superadmin no incluía validación de formato UUID — ahora sí (fix SEC-03).

---

## Seguridad en webhooks externos

### Glovo webhook — HMAC-SHA256

`POST /api/glovo/webhook` verifica la firma del body usando HMAC-SHA256 con `GLOVO_WEBHOOK_SECRET`:

```typescript
async function verifyGlovoSignature(rawBody: string, signatureHeader: string | null): Promise<boolean>
```

- Comparación timing-safe (`|=` bitwise XOR — evita timing attacks)
- Fail-closed: si `GLOVO_WEBHOOK_SECRET` no está configurado, retorna 503
- El body se lee como texto (`request.text()`) antes de parsear JSON — necesario para que la firma sea válida

> `GLOVO_WEBHOOK_SECRET` debe configurarse en `.env` y Vercel cuando la integración Glovo entre en producción.

### Telegram webhook — fail-closed

`POST /api/telegram/webhook` verifica el header `X-Telegram-Bot-Api-Secret-Token`:

- Comparación directa con `TELEGRAM_WEBHOOK_SECRET` del entorno
- Si `TELEGRAM_WEBHOOK_SECRET` está vacío o no configurado → retorna **503** (no procesa el webhook)
- Antes retornaba 200 si el secret faltaba — comportamiento fail-open corregido

### WAITER_PIN_PEPPER — fail-closed

`src/lib/waiter-auth.ts` obtiene el pepper de PIN vía función lazy que lanza si no está configurado:

```typescript
function getPinPepper(): string {
  const pepper = process.env.WAITER_PIN_PEPPER;
  if (!pepper) throw new Error('WAITER_PIN_PEPPER is not configured');
  return pepper;
}
```

Antes existía un fallback hardcodeado (`'default-pepper'`). El fallback se eliminó: un pepper hardcodeado invalida la protección PBKDF2 scoped por empresa.

---

## Incidente 2026-07-31 (auditoría externa, pentest de código) — IDOR cross-tenant en `/api/mesas/*`

Un pentest en vivo (headers falsificados contra la API real) más lectura de código encontró un hallazgo real en `src/app/api/mesas/[mesaId]/{propina,division,call-waiter}/route.ts`: el patrón `let empresaId = request.headers.get('x-empresa-id'); if (!empresaId) { /* derivar por dominio */ }` — comentado como "proxy does not inject x-empresa-id for this route" — **confiaba en el header del cliente cuando estaba presente**, y solo caía al dominio si estaba ausente. `proxy.ts` solo verifica/sobreescribe `x-empresa-id` para rutas bajo `/api/admin`, `/api/waiter`, `/api/kitchen`, `/api/tpv`, `/api/laborcontrol`, `/api/superadmin` — `/api/mesas/*` no está en esa lista, así que el header del cliente llegaba intacto al handler.

Explotación: `empresas.id` es públicamente legible (`Publico ve empresas`, `qual: true`) via `/rest/v1/empresas`, así que un atacante que conociera el `mesaId` (UUID) de otro tenant podía enviar `x-empresa-id: <empresa_id real de esa tenant>` y pasar el chequeo `.eq('empresa_id', empresaId)` — porque el valor contra el que se compara también era el que el atacante eligió. Permitía mutar la propina, la división de cuenta o disparar una llamada de camarero falsa en la mesa de otra empresa. `lock/route.ts` (GET/POST/DELETE) no tenía **ningún** chequeo de tenant — ni siquiera el patrón con fallback, bastaba con conocer el `mesaId`.

Un caso relacionado, mismo mecanismo: `POST /api/glovo/order` (despacho manual de Glovo) tampoco estaba cubierto por ningún branch de `proxy.ts` — `requireAuth()` ahí confiaba en headers sin ninguna verificación JWT.

**Fix**:
1. `propina`, `division`, `call-waiter`: se eliminó por completo la lectura de `x-empresa-id` — el tenant se deriva **solo** del dominio, que no es falsificable por el cliente (a diferencia de un header HTTP arbitrario).
2. `lock/route.ts`: se añadió `requireMesaInOwnTenant()` (deriva por dominio + verifica `mesas.empresa_id`) antes de las 3 operaciones — no tenía ninguno.
3. `proxy.ts`: nuevo branch `path === '/api/glovo/order'` → `handleAdminAuth` (scoped exacto, no afecta `/api/glovo/webhook` que se verifica por HMAC ni `/api/glovo/quote` que es público por diseño). Se añadió también `requireRole(['admin','superadmin'])` en el handler.
4. `supabase/functions/tenant-backup/index.ts`: el compare del `BACKUP_SECRET` usaba `!==` directo (no timing-safe) — se cambió al mismo patrón XOR que ya usa el webhook de Glovo en este proyecto.

Cubierto por `e2e/compliance/mesas-tenant-header-spoofing.spec.ts` — compara la respuesta de cada ruta con un `x-empresa-id` falsificado contra la respuesta sin header (deben ser idénticas), y confirma que `/api/glovo/order` ahora exige sesión admin real. Corre en CI vía `e2e.yml` (siempre) y `compliance.yml` (path filter ampliado con `src/proxy.ts`, `src/app/api/mesas/**`, `src/app/api/glovo/**`).

**Lección para nuevas rutas fuera de `/api/admin|waiter|kitchen|tpv|laborcontrol|superadmin`**: si la ruta necesita identificar el tenant, derivarlo **solo** por dominio (`getDomainFromHeaders()` + `parseMainDomain()`) o por una sesión verificada explícitamente en el propio handler (como hacen `waiter/auth` o `tpv/empleados/login`) — nunca leer `x-empresa-id`/`x-admin-rol` de la request como si `proxy.ts` los hubiera saneado, sin confirmar primero que esa ruta está efectivamente dentro de uno de los 6 prefijos que el proxy cubre.

**Nota sobre una hipótesis descartada durante esta auditoría**: en el mismo pentest se planteó inicialmente que `proxy.ts` no se registraba como middleware de Next.js (por no llamarse `middleware.ts`) y que por lo tanto ninguna ruta admin/waiter/tpv verificaba nada. Se refutó empíricamente antes de actuar sobre ella: `.next/server/middleware.js` existe compilado, la CSP de producción trae el nonce criptográfico que solo genera `proxy.ts` en runtime, y una petición real con `x-admin-rol: superadmin` falsificado contra `/api/admin/pedidos` en producción devolvió 401. El proyecto corre Next.js 16.2.12, que adoptó `proxy.ts` como el nombre de convención — la hipótesis partía de una convención de Next.js desactualizada. Documentado para que quede claro por qué no se tocó nada en esa dirección, pese a haber sido la alarma inicial.

---

## Aislamiento de tenant en endpoints de mesa pública

Las rutas `/api/mesas/[mesaId]/*` no tienen JWT de admin. El proxy inyecta `x-empresa-id` desde el dominio del tenant. Todas las mutaciones verifican que la mesa pertenece al tenant **antes de operar**:

```typescript
const { data: mesa } = await supabase
  .from('mesas')
  .select('id')
  .eq('id', mesaId)
  .eq('empresa_id', empresaId)
  .single();
if (!mesa) return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
```

Rutas que aplican este patrón: `activate`, `call-waiter`, `division`, `lock`, `propina`.

Sin este check, conocer el UUID de una mesa de otro tenant permitiría mutarla vía petición directa.

---

## Protección de logs de pago

`console.log` con datos de pago eliminados de:

- `src/core/application/use-cases/payment/initiateRedsysPaymentUseCase.ts` — `pedidoId`, importes, parámetros Redsys decodificados
- `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` — ídem para pagos de mesa
- `src/components/cart-drawer.tsx` — `decoded params` del formulario Redsys client-side

Los logs de depuración de flujos de pago no deben aparecer en producción — exponen importes, referencias de pedido y parámetros que podrían ser explotados para análisis de tráfico.

---

## Validación FK en restauración de backup

`POST /api/admin/backup/restore` (restauración de snapshot desde R2) valida las claves foráneas de `receta_items` antes del upsert:

```typescript
const validProductoIds   = new Set((snapshot.productos    ?? []).map(r => r['id'] as string));
const validIngredienteIds = new Set((snapshot.ingredientes ?? []).map(r => r['id'] as string));
const recetaItemsSanitized = (snapshot.receta_items ?? []).filter(r =>
  validProductoIds.has(r['producto_id'] as string) &&
  (r['ingrediente_id'] === null || validIngredienteIds.has(r['ingrediente_id'] as string))
);
```

Un snapshot corrupto o malicioso no puede insertar `receta_items` que referencien productos o ingredientes de otros tenants. El campo `empresa_id` se fuerza a `empresaId` del JWT en todas las tablas con esa columna.

---

## CSP — Vercel preview toolbar

La directiva `frame-src` incluye `https://vercel.live https://*.vercel.live` en entornos no-producción (`VERCEL_ENV !== 'production'`):

```typescript
`frame-src 'self' https://www.google.com https://maps.google.com${
  process.env.VERCEL_ENV !== 'production' ? ' https://vercel.live https://*.vercel.live' : ''
}`
```

Vercel inyecta su toolbar de feedback como `<iframe>` en deployments de preview. Sin este permiso, el browser reportaba violaciones CSP como eventos de Sentry aunque no hubiera problema de seguridad real. En producción `VERCEL_ENV==='production'`, el toolbar no aparece y el dominio no se agrega.

---

## Estándares y certificaciones de seguridad — referencia

Guía rápida de los estándares más comunes en software. Ninguno es obligatorio por defecto — su necesidad depende del sector y del tipo de cliente.

### ISO 27001

Estándar internacional de gestión de seguridad de la información (Information Security Management System — ISMS). Publicado por ISO/IEC.

- **Qué cubre**: gestión de riesgos, controles organizativos, físicos y tecnológicos (114 controles en el Anexo A: cifrado, control de acceso, gestión de incidentes, continuidad de negocio…)
- **Cómo se obtiene**: auditoría externa por organismo certificador acreditado (AENOR, Bureau Veritas, etc.)
- **Validez**: certificado con revisión anual y recertificación cada 3 años
- **¿Cuándo aplica?**: cuando clientes enterprise o institucionales la exigen como requisito de proveedor, o para diferenciar en mercados donde la seguridad es argumento de venta
- **Coste**: auditoría + mantenimiento — viable para empresas medianas/grandes, oneroso para startups
- **Aplicabilidad a multi_shop**: no aplica en el estado actual. Podría ser relevante si se vende a cadenas hospitalarias, administración pública o grandes retailers

### SOC 2 (Service Organization Control 2)

Marco de auditoría americano definido por la AICPA. Evalúa controles relacionados con los Trust Service Criteria: seguridad, disponibilidad, integridad del procesamiento, confidencialidad y privacidad.

- **Tipos**:
  - **Type I**: fotografía puntual de los controles en una fecha
  - **Type II**: auditoría del funcionamiento real de los controles durante 6–12 meses (el estándar gold del mercado SaaS)
- **¿Cuándo aplica?**: empresas SaaS B2B que venden a corporaciones americanas o internacionales que procesan datos sensibles de terceros
- **Coste**: significativo (auditores especializados, tiempo interno de preparación)
- **Aplicabilidad a multi_shop**: no aplica. La piden cuando el SaaS maneja datos de salud, financieros o de RRHH de otras empresas

### GDPR / LOPDGDD ✅ (aplica)

**Reglamento General de Protección de Datos** (EU 2016/679) + **Ley Orgánica de Protección de Datos y Garantía de los Derechos Digitales** (española).

- **Obligatorio**: sí, para cualquier empresa que procese datos personales de ciudadanos de la UE
- **Datos afectados en multi_shop**: emails y teléfonos de clientes (`clientes` table), emails de suscriptores de promociones
- **Cumplimiento implementado**:
  - Anonimización de PII en logs (`anonymizeEmail()` — `"us***@ejemplo.com"`)
  - Baja de newsletter con token HMAC TTL 1 año (`UNSUBSCRIBE_HMAC_SECRET`)
  - Sin logging de emails/teléfonos en `log_errors`
  - RLS con denegación explícita a `anon` en tabla `clientes`
- **Pendiente a nivel negocio** (fuera del scope de código): política de privacidad publicada, registro de actividades de tratamiento, DPA con Supabase y Brevo, nombrar DPO si aplica

### Ley Antifraude — RD 1007/2023 ✅ (aplica al TPV)

Real Decreto que regula los sistemas informáticos de facturación para garantizar la integridad e inalterabilidad de los registros.

- **Obligatorio**: sí, para software de gestión de ventas que emite tickets fiscales en España
- **Cumplimiento implementado**:
  - Cadena de hashes SHA-256 por cobro (pgcrypto) — inmutable a nivel DB (triggers bloquean DELETE/UPDATE)
  - Numeración correlativa atómica por empresa
  - Ticket rectificativo con referencia al original (no modifica registros)
  - IVA/IGIC calculado server-side en trigger (no en cliente)
  - **Desglose de ítems en ticket** (`detalle_items JSONB`) — nombre, cantidad y precio unitario por producto. Inmutable post-inserción (trigger `tpv_cobro_block_update` extendido con `IS DISTINCT FROM`). Auto-construido server-side para cobros de mesa; enviado por cliente para mostrador. Rectificativa hereda ítems del original. (20260714)
  - **Informe Z** — `numero_z BIGINT` en `tpv_turnos`, asignado en trigger BEFORE UPDATE con `pg_advisory_xact_lock` por `empresa_id` (serialización concurrente, cero race conditions). Modal `InformeZModal` con auto-print al cerrar turno. API `GET /api/tpv/turno/[id]/informe-z` con tenant isolation. (20260714)
  - Endpoint de auditoría `GET /api/tpv/audit/chain` y exportación `GET /api/tpv/audit/export`
  - **Token de inspector (Hacienda)**: `POST /api/tpv/audit/inspector-token` genera un JWT firmado con `ACCESS_TOKEN_SECRET`, audiencia `inspector-hacienda`, validez 24h, con `jti` único. El token se entrega al inspector fuera de banda; el inspector lo pega en `/tpv/audit/inspector`. La verificación en `verifyInspectorToken()` comprueba firma, audiencia y lista de revocación (`isTokenRevoked(jti)`), permitiendo invalidación anticipada si es necesario. El token se pasa exclusivamente en header `Authorization: Bearer` — nunca en URL.
  - Pantalla de declaración de conformidad `/tpv/legal`
- **Referencia**: RD 1619/2012 (facturación) + RD 1007/2023 (sistemas informáticos)

### PCI DSS (Payment Card Industry Data Security Standard)

Estándar de seguridad para empresas que procesan pagos con tarjeta.

- **¿Cuándo aplica?**: cuando la aplicación almacena, procesa o transmite datos de tarjeta (PAN, CVV, PIN)
- **Aplicabilidad a multi_shop**: **no aplica directamente** — los pagos van a Redsys TPV Virtual (Redsys está certificado PCI DSS). multi_shop nunca ve ni almacena datos de tarjeta; solo genera el formulario firmado y recibe el webhook de confirmación. Este modelo (redirect a TPV externo) se llama SAQ A-EP y la responsabilidad PCI recae en Redsys, no en el comercio.

### OWASP Top 10

Lista de las 10 vulnerabilidades web más críticas publicada por la Open Web Application Security Foundation. No es una certificación — es una referencia técnica de buenas prácticas.

- **No es obligatorio**, pero es el estándar de facto para auditorías de seguridad de aplicaciones web
- **Auditoría realizada**: julio 2026 (ver commits en rama `security/owasp-audit-july-2026`). Todos los hallazgos críticos resueltos.
- **Categorías cubiertas**: A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, A05 Security Misconfiguration, A06 Vulnerable Components (webhooks), A09 Security Logging

---

## Pendientes conocidos

| Item | Severidad | Notas |
|------|-----------|-------|
| `GLOVO_WEBHOOK_SECRET` en entorno | High | El scaffold HMAC-SHA256 está implementado. Requiere configurar la variable en `.env` y Vercel cuando Glovo entre en producción. |
| Cart token generación con `jti` | Low | El proxy valida `aud: 'cart-access'` y llama `isTokenRevoked(jti)` si el claim está presente. Cuando se implemente la generación, incluir `jti` para habilitar revocación completa. |
| `unsafe-inline` en `style-src` | Low | Estándar para la mayoría de aplicaciones Next.js. Mejorable con style nonces si el framework lo soporta en el futuro. |
| Order number gaps | Low | Si el INSERT falla tras `get_next_pedido_number`, el número se pierde. Operacionalmente menor, no es riesgo de seguridad. |
| Rate limit por tenant en pedidos públicos | Low | La creación de pedidos y clientes usa rate limit por IP. Para tenants con mucho tráfico legítimo desde IPs compartidas (NAT corporativo), considerar rate limit compuesto `empresaId:ip`. |
| Leaked password protection (Supabase Auth) | Info | Requiere plan Pro de Supabase. Aceptado como riesgo conocido — el login de admin usa `auth.users` gestionado internamente, no contraseñas de usuarios finales. Activar en Dashboard → Auth → Policies cuando se actualice al plan Pro. |
| `get_mi_empresa_id()` callable por authenticated | Info | Intencional — necesario para cláusulas USING de RLS policies. No es un vector de ataque: la función solo devuelve el empresaId del admin autenticado. |
