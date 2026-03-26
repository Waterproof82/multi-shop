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

`requireRole(request, ['admin'])` se aplica en **todos los handlers mutativos** (POST, PUT, PATCH, DELETE) de las siguientes routes:

| Route | Handlers protegidos |
|-------|-------------------|
| `/api/admin/productos` | POST, PUT, DELETE |
| `/api/admin/categorias` | POST, PUT, DELETE |
| `/api/admin/pedidos` | PATCH, DELETE |
| `/api/admin/clientes` | POST, PATCH, DELETE |
| `/api/admin/empresa` | PUT |
| `/api/admin/update-colores` | POST |
| `/api/admin/upload-image` | POST |
| `/api/admin/promociones` | POST |
| `/api/admin/pedidos/enviar-email` | POST |

Los handlers GET (solo lectura) no requieren verificación de rol.

### Rol actual en DB

La tabla `perfiles_admin` tiene `rol TEXT DEFAULT 'admin'`. Actualmente existe un único rol: `admin`. Con el RBAC en su lugar, cualquier nuevo rol añadido al sistema (ej. `viewer`) recibirá automáticamente 403 en todas las operaciones destructivas sin cambios adicionales en el código.

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
| `frame-ancestors` | `'self'` |
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
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
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

## JSON-LD Sanitization

El componente `json-ld.tsx` sanitiza datos antes de insertar en `<script type="application/ld+json">`:

```typescript
function safeJsonStringify(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
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

## Pendientes conocidos

| Item | Severidad | Notas |
|------|-----------|-------|
| Cart token generación con `jti` | Low | El proxy valida y requiere `aud: 'cart-access'` pero no hay revocación de cart tokens. Cuando se implemente la generación, incluir `jti` y llamar `isTokenRevoked` en `handleCartAccessToken`. |
| `unsafe-inline` en `style-src` | Low | Estándar para la mayoría de aplicaciones Next.js. Mejorable con style nonces si el framework lo soporta en el futuro. |
| Order number gaps | Low | Si el INSERT falla tras `get_next_pedido_number`, el número se pierde. Operacionalmente menor, no es riesgo de seguridad. |
| Rate limit por tenant en pedidos públicos | Low | La creación de pedidos y clientes usa rate limit por IP. Para tenants con mucho tráfico legítimo desde IPs compartidas (NAT corporativo), considerar rate limit compuesto `empresaId:ip`. |
