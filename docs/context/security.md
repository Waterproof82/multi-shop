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

### Runtime guard para ACCESS_TOKEN_SECRET

El secret de JWT se obtiene mediante funciones lazy que leen la variable de entorno en cada invocación (no al cargar el módulo), evitando que se firmen tokens con un secret vacío o `"undefined"`:

- **`auth-admin.use-case.ts`**: `getTokenSecret()` lanza error si falta — para firma y verificación de tokens
- **`proxy.ts`**: `getAdminTokenSecret()` retorna `undefined` si falta — retorna 500 al cliente

```typescript
// auth-admin.use-case.ts
function getTokenSecret(): Uint8Array {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

// proxy.ts — lazy read, not module-level constant
function getAdminTokenSecret(): string | undefined {
  return process.env.ACCESS_TOKEN_SECRET;
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

### Flujo de autenticación

```
Login (POST /api/admin/login)
  → Zod valida credenciales
  → AuthAdminUseCase.login() verifica contra Supabase
  → getTokenSecret() valida que ACCESS_TOKEN_SECRET existe
  → JWT firmado con jti=randomUUID() → cookie admin_token
  → CSRF token generado → cookie csrf_token

Cada request a /api/admin/* (excepto rutas públicas)
  → proxy.ts verifica JWT
  → Comprueba revocación del jti en Redis (fail-closed en prod)
  → Inyecta x-empresa-id, x-admin-id, x-admin-rol en headers
  → requireAuth() lee x-empresa-id para aislar tenant

Páginas admin server-side
  → AuthAdminUseCase.verifyToken(token)
  → Verifica firma JWT
  → Comprueba revocación del jti en Redis (fail-closed en prod)
  → Retorna admin con empresaId o null

Logout (POST /api/admin/logout)
  → jwtVerify(admin_token) → extrae jti + exp
  → revokeToken(jti, ttlRestante) → Upstash Redis SET key EX ttl
  → Borra admin_token y csrf_token
```

### Rutas públicas (sin autenticación)

Definidas en `isPublicRoute()` dentro de `proxy.ts` con coincidencia exacta (no prefijo):

- `GET /api/admin/login` — obtener CSRF token
- `POST /api/admin/login` — autenticarse
- `POST /api/admin/logout` — cerrar sesión
- `GET /api/admin/promociones/unsubscribe` — baja de promociones
- `POST /api/unsubscribe` — baja de promociones (ruta pública)
- `POST /api/csp-report` — recolector de violaciones CSP

---

## Protección CSRF

### Mecanismo

Se usa un token HMAC-SHA256 firmado con `CSRF_HMAC_SECRET`. El flujo es:

1. El cliente solicita `GET /api/admin/login` → recibe el token en la respuesta JSON (con `Cache-Control: no-store, private` para evitar caching por proxies) y una cookie `csrf_token` con el formato `token:firma`
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

- **`next.config.mjs`** define el CSP estático de fallback (para assets estáticos)
- **`proxy.ts`** genera un CSP dinámico con nonce por cada request de página

### Nonce por request

Para cada request de página, el proxy genera un nonce único:

```typescript
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
```

El nonce se inyecta en:
- Header de request `x-nonce` → leído por `layout.tsx` para pasarlo a `ThemeProvider`
- Header de respuesta `Content-Security-Policy` con `'nonce-{nonce}'` en `script-src`

Esto elimina la necesidad de `unsafe-inline` en `script-src`.

### Directivas vigentes

| Directiva | Valor |
|-----------|-------|
| `script-src` | `'self' 'nonce-{nonce}' 'unsafe-eval'` |
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

> `unsafe-eval` es necesario por el runtime interno de Next.js/Turbopack.
> `{R2_DOMAIN}` se deriva de la variable de entorno `NEXT_PUBLIC_R2_DOMAIN` (sin `https://` hardcodeado).

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

Implementado con Upstash Redis (`@upstash/ratelimit`).

| Limitador | Rutas | Límite |
|-----------|-------|--------|
| `rateLimitLogin` | `POST /api/admin/login` | 5 intentos / 15 min por IP |
| `rateLimitPublic` | `GET /api/admin/login`, `/api/pedidos`, `/api/unsubscribe` | 20 req / min por IP |
| `rateLimitAdmin` | Todas las rutas `/api/admin/*` | 60 req / min por IP |

La IP real se extrae del header `cf-connecting-ip` (Cloudflare) con fallback al primer entry de `x-forwarded-for`.

### Fail-closed en login (producción)

Si Redis no está configurado en producción, `rateLimitLogin` devuelve **503 Service Unavailable** en lugar de permitir intentos ilimitados. Esto previene ataques de fuerza bruta si Redis falla o no se configura:

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

Los limitadores `rateLimitPublic` y `rateLimitAdmin` degradan gracefully (sin límite) cuando Redis no está disponible — solo login es fail-closed por ser el vector de ataque más crítico.

---

## Validación de entorno al startup

El módulo `src/core/infrastructure/env-validation.ts` se ejecuta al iniciar la aplicación vía `src/instrumentation.ts` (hook `register()` de Next.js):

```typescript
export function register() {
  validateEnv();
}
```

### Comportamiento por entorno

- **Producción**: falla con error fatal si faltan variables requeridas (incluyendo `UPSTASH_*` y `CORS_*`)
- **Desarrollo**: muestra warnings para variables recomendadas en producción, error en consola para variables siempre requeridas

### Variables validadas

| Variable | Siempre requerida | Solo producción |
|----------|:-:|:-:|
| `ACCESS_TOKEN_SECRET` | ✓ | |
| `CSRF_HMAC_SECRET` | ✓ | |
| `CART_TOKEN_SECRET` | ✓ | |
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

**Todas** las rutas que leen el body envuelven `request.json()` en un try/catch dedicado para evitar crashes por JSON malformado y devolver un 400 descriptivo en lugar de un 500 genérico:

```typescript
let body: unknown;
try {
  body = await request.json();
} catch {
  return validationErrorResponse('Invalid request body');
}
```

Rutas cubiertas: `/api/admin/login`, `/api/admin/productos`, `/api/admin/categorias`, `/api/admin/clientes`, `/api/admin/empresa`, `/api/admin/update-colores`, `/api/admin/pedidos`, `/api/admin/pedidos/enviar-email`, `/api/admin/promociones`, `/api/pedidos`.

### Schema público de pedidos — límites anti-abuso

El schema de `POST /api/pedidos` incluye restricciones para prevenir payloads abusivos:

```typescript
items: z.array(...).min(1).max(50)
item.name: z.string().max(200)
item.price: z.number().min(0).max(100_000)
quantity: z.number().int().min(1).max(99)
selectedComplements: z.array(...).max(20)
selectedComplements[].id: z.string().uuid()  // verified against DB
```

### Límites en productos

Los schemas de creación/actualización de productos incluyen:

- Títulos (i18n): max 200 caracteres
- Descripciones (i18n): max 2000 caracteres
- `foto_url`: requiere esquema `https://`
- `precio`: min 0

### Límites en categorías

Los schemas de creación/actualización de categorías incluyen:

- Nombres (i18n): max 200 caracteres
- Descripciones (i18n): max 2000 caracteres

### Límites en clientes

- `nombre`: max 200 caracteres
- `direccion`: max 500 caracteres
- `telefono`: min 7, max 30, regex `^\+?[0-9\s\-()+]+$`

### Límites en promociones

- `texto_promocion`: max 1000 caracteres
- `imagen_url`: requiere esquema `https://`

### Límites en enviar-email (admin)

Schema endurecido con las mismas restricciones que el schema público de pedidos:

- `item.id`: UUID validado
- `item.name`: max 200 caracteres
- `item.price`: min 0, max 100.000
- `quantity`: entero, min 1, max 99
- `items`: min 1, max 50
- `selectedComplements`: max 20, name max 200

---

## Seguridad en uploads de imágenes

El endpoint `POST /api/admin/upload-image` aplica:

1. **Validación MIME type** contra lista blanca: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
2. **Validación magic bytes** — verifica la cabecera binaria real del archivo, no solo el MIME declarado por el cliente
3. **Límite de tamaño**: 10 MB máximo
4. **Path seguro**: el nombre de fichero del cliente nunca se usa en la ruta de R2 — se genera `{slug}/{año}/{mes}/{uuid}.{ext}`
5. **Slug desde DB**: el slug de la empresa se obtiene de la base de datos, nunca del cliente

---

## Prevención de enumeración de usuarios

El endpoint `POST /api/admin/login` retorna un mensaje genérico `"Credenciales inválidas"` para todos los tipos de fallo de autenticación (usuario no encontrado, contraseña incorrecta, usuario no autorizado como admin). Esto previene que un atacante pueda determinar si un email existe en el sistema.

---

## Manejo de errores HTTP

`handleResult()` en `helpers.ts` mapea códigos de error de dominio a status HTTP apropiados:

| Error code | HTTP status |
|------------|-------------|
| `VALIDATION_ERROR` | 400 |
| `PRODUCT_NOT_FOUND`, `NOT_FOUND` | 404 |
| `AUTH_*` | 401 |
| Otros | 500 |

---

## Principio de mínimo privilegio en endpoints públicos

El endpoint público `POST /api/pedidos` usa `empresaPublicRepository` (clave anon de Supabase) para la consulta de empresa, en lugar de `empresaRepository` (service role). Las operaciones de escritura (creación de pedido/cliente) usan service role ya que son necesarias.

---

## JSON-LD Sanitization

El componente `json-ld.tsx` sanitiza los datos antes de insertarlos en `<script type="application/ld+json">` para prevenir inyección:

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

El proxy valida cart tokens (recibidos via `?access=` query param) con `CART_TOKEN_SECRET` y requiere el audience claim `'cart-access'` para prevenir token confusion con admin JWTs:

```typescript
const { payload } = await jwtVerify(sanitizedToken, secret, { audience: 'cart-access' });
```

Cuando se implemente la generación de cart tokens, deben incluir:

```typescript
new SignJWT({ /* claims */ })
  .setProtectedHeader({ alg: 'HS256' })
  .setAudience('cart-access')
  .setExpirationTime('15m')
  .sign(new TextEncoder().encode(process.env.CART_TOKEN_SECRET));
```

---

## Multi-tenant — dominio parsing

`parseMainDomain()` en `domain-utils.ts` usa `endsWith('-pedidos')` (no `includes`) para el sufijo de pedidos, evitando falsos positivos con dominios como `evil-pedidos-attack.com`.

---

## Aislamiento multi-tenant

- El proxy extrae `empresaId` del JWT verificado e inyecta `x-empresa-id` en los headers de cada request
- `requireAuth()` lee ese header — no acepta el header si el proxy no lo inyectó
- Todos los repositorios filtran por `empresaId` en cada query
- Update y delete usan filtro compuesto: `.eq("id", id).eq("empresa_id", empresaId)`
- Supabase usa `service_role` con RLS; el aislamiento de tenant se enforza a nivel de aplicación en el repositorio

---

## Protección contra XSS en emails

Todo el contenido generado por el usuario que se inserta en HTML de emails pasa por `escapeHtml()`:

```typescript
import { escapeHtml } from '@/lib/html-utils';
// ...
textoEscapado: escapeHtml(texto_promocion),
```

Nunca se inserta input de usuario directamente en cadenas HTML.

### Logging centralizado en emails

El módulo `brevo-email.ts` usa el logger centralizado (`logger`) en lugar de `console.error`. Los datos sensibles (como respuestas de la API de Brevo y direcciones email de destinatarios) no se loguean — solo se registra el código de status y el número de destinatarios:

```typescript
await logger.logAndReturnError(
  'BREVO_API_ERROR',
  `Brevo API error: ${response.status}`,
  'api',
  'sendEmail',
  { details: { status: response.status, recipientCount: recipients.length } }
);
```

---

## Price Tampering Protection

`PedidoUseCase.create` recalcula el total desde precios reales de DB via `IProductRepository.findByIds` — el total del cliente se ignora completamente. Los complementos también se verifican por ID contra la base de datos.

### Rechazo de productos desconocidos

Si un producto o complemento enviado por el cliente no existe en la base de datos, el pedido se rechaza con error `PRODUCT_NOT_FOUND` en lugar de aceptar el precio declarado por el cliente:

```typescript
for (const ci of data.items) {
  const pid = ci.item?.id;
  if (pid && !priceMap.has(pid)) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: `Producto no encontrado: ${pid}`,
        module: 'use-case',
        method: 'PedidoUseCase.create',
      },
    };
  }
}
```

Esto elimina el vector de ataque donde un cliente podía enviar un UUID válido pero inexistente con precio `0.01`.

---

## Unsubscribe Tokens

HMAC-SHA256 con TTL 7 días y prefijo de dominio (`unsubscribe:`) — previene uso cruzado con tokens CSRF. Cada destinatario recibe un token individual al enviar promociones.

El handler de unsubscribe en `/api/admin/promociones/unsubscribe` usa el Result pattern y pasa explícitamente la acción `'baja'` para garantizar que siempre desuscribe (nunca toggle):

```typescript
const result = await clienteUseCase.togglePromoSubscription(normalizedEmail, empresaId, 'baja');
if (!result.success) {
  return NextResponse.redirect(`${baseUrl}/?error=internal`);
}
if (result.data === null) {
  return NextResponse.redirect(`${baseUrl}/?error=notfound`);
}
```

El endpoint público `/api/unsubscribe` acepta el parámetro `action` (`alta`/`baja`) desde la URL y lo pasa al use case.

---

## CORS

Configurado en el proxy para todas las rutas `/api/*` (admin y públicas). Solo se permiten orígenes definidos en:

- `CORS_ALLOWED_ORIGINS` — lista exacta de orígenes separada por comas
- `CORS_ALLOWED_DOMAINS` — dominios (incluye subdominios)
- `http://localhost:*` — permitido automáticamente en desarrollo

`Vary: Origin` se añade a todas las respuestas para evitar cache poisoning.

Las rutas públicas (`/api/pedidos`, `/api/unsubscribe`) también reciben headers CORS — necesario porque el subdominio de pedidos puede diferir del dominio principal.

---

## UI/Accessibility Security

Comprehensive audit completed (score: 8.5/10). Key hardening applied:

- **Touch targets**: All interactive elements enforce 44x44px minimum (`min-h-[44px] min-w-[44px]`)
- **ARIA compliance**: Custom toggle switches use `role="switch"` + `aria-checked`. All interactive buttons have `aria-label`
- **Focus rings**: Standardized to `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` across all components
- **Reduced motion**: `useReducedMotion()` from Framer Motion and `motion-reduce:` Tailwind class applied to all animations, scroll behaviors, and transitions
- **Contrast**: Footer text raised from `/70`-`/80` opacity to `/85`-`/100` to meet WCAG AA 4.5:1 minimum
- **i18n in ARIA**: All `aria-label` values routed through `t()` translation function — no hardcoded single-language accessibility text
- **No AI slop**: No gradient text, glassmorphism, bounce easing, hero metrics grids, or generic fonts

---

## Variables de entorno requeridas

| Variable | Uso | Validación startup |
|----------|-----|--------------------|
| `ACCESS_TOKEN_SECRET` | Firma JWT de sesión admin | ✓ Siempre |
| `CSRF_HMAC_SECRET` | Firma HMAC de tokens CSRF | ✓ Siempre |
| `CART_TOKEN_SECRET` | JWT de acceso al carrito | ✓ Siempre |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase | ✓ Siempre |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase | ✓ Siempre |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service role de Supabase | ✓ Siempre |
| `NEXT_PUBLIC_R2_DOMAIN` | Dominio público de imágenes R2 | — |
| `UPSTASH_REDIS_REST_URL` | Rate limiting + JWT revocation | ✓ Producción |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting + JWT revocation | ✓ Producción |
| `BREVO_API_KEY` | Envío de emails transaccionales | — |
| `BREVO_DEFAULT_SENDER_EMAIL` | Remitente por defecto | — |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos en CORS | — |
| `CORS_ALLOWED_DOMAINS` | Dominios permitidos en CORS | ✓ Producción |
| `CLOUDFLARE_API_TOKEN` | Upload directo vía Cloudflare API | — |

---

## Pendientes conocidos

| Item | Severidad | Notas |
|------|-----------|-------|
| RBAC en rutas admin | Medium | El proxy inyecta `x-admin-rol` pero ninguna ruta lo verifica. Cualquier admin autenticado puede realizar cualquier acción. |
| Cart token generación con audience | Low | El proxy valida `aud: 'cart-access'` pero aún no hay generación de cart tokens en el codebase. Cuando se implemente, usar `new SignJWT({...}).setAudience('cart-access')`. |
| `unsafe-eval` en CSP | Medium | Requerido por Next.js/Turbopack. Considerar `report-to` para monitorizar explotación. |
| CSP reporting endpoint | Low | `/api/csp-report` está en `isPublicRoute` pero el endpoint no existe. Las violaciones CSP no se registran. |
| `unsafe-inline` en style-src | Low | Estándar para la mayoría de aplicaciones. Mejorable con style nonces si el framework lo soporta. |
| Rate limit por tenant en emails | Low | Un tenant con miles de clientes suscritos puede disparar un envío masivo. Brevo limita externamente pero no hay protección a nivel de aplicación. |
| Order number gaps | Low | Si el INSERT falla tras `get_next_pedido_number`, el número se pierde. Operacionalmente menor, no es un riesgo de seguridad. |
