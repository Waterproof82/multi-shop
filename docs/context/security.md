# Seguridad — multi_shop

Documento de referencia sobre las medidas de seguridad implementadas en el proyecto. Cubre autenticación, autorización, protección de APIs, CSP, rate limiting y validación de inputs.

---

## Autenticación y sesión

### JWT en cookies HttpOnly

El panel admin usa JWT firmados con `ACCESS_TOKEN_SECRET` almacenados en una cookie `admin_token` con los atributos:

- `HttpOnly` — inaccesible desde JavaScript del navegador
- `Secure` — solo se envía por HTTPS en producción
- `SameSite: lax` — protección parcial contra CSRF en navegación cross-site
- `MaxAge: 86400` — expira en 24 horas

El token incluye `empresaId`, `adminId` y `rol` en el payload.

### Flujo de autenticación

```
Login (POST /api/admin/login)
  → Zod valida credenciales
  → AuthAdminUseCase.login() verifica contra Supabase
  → JWT firmado → cookie admin_token
  → CSRF token generado → cookie csrf_token

Cada request a /api/admin/* (excepto rutas públicas)
  → proxy.ts verifica JWT
  → Inyecta x-empresa-id, x-admin-id, x-admin-rol en headers
  → requireAuth() lee x-empresa-id para aislar tenant

Logout (POST /api/admin/logout)
  → Borra admin_token
  → Borra csrf_token
```

### Rutas públicas (sin autenticación)

Definidas en `isPublicRoute()` dentro de `proxy.ts`:

- `GET /api/admin/login` — obtener CSRF token
- `POST /api/admin/login` — autenticarse
- `POST /api/admin/logout` — cerrar sesión
- `POST /api/admin/promociones/unsubscribe` — baja de promociones
- `POST /api/unsubscribe` — baja de promociones (ruta pública)
- `POST /api/csp-report` — recolector de violaciones CSP

---

## Protección CSRF

### Mecanismo

Se usa un token HMAC-SHA256 firmado con `CSRF_HMAC_SECRET`. El flujo es:

1. El cliente solicita `GET /api/admin/login` → recibe el token en la respuesta JSON y una cookie `csrf_token` con el formato `token:firma`
2. En cada mutación (POST, PUT, PATCH, DELETE), el cliente envía el token en el header `x-csrf-token`
3. El proxy verifica que `x-csrf-token` coincide con el token de la cookie y que la firma HMAC es válida

### Comparación timing-safe

La verificación de la firma usa `crypto.timingSafeEqual` para evitar ataques de temporización:

```typescript
export function verifyCsrfToken(token: string, signature: string): boolean {
  const expected = signCsrfToken(token);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

Implementado con Upstash Redis (`@upstash/ratelimit`). Con degradación elegante: si Redis no está configurado, no limita (útil en desarrollo local).

| Limitador | Rutas | Límite |
|-----------|-------|--------|
| `rateLimitLogin` | `POST /api/admin/login` | 5 intentos / 15 min por IP |
| `rateLimitPublic` | `GET /api/admin/login`, `/api/pedidos`, `/api/unsubscribe` | 20 req / min por IP |
| `rateLimitAdmin` | Todas las rutas `/api/admin/*` | 60 req / min por IP |

La IP real se extrae del header `cf-connecting-ip` (Cloudflare) con fallback a `x-forwarded-for`.

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

Todas las rutas que leen el body envuelven `request.json()` en try/catch para evitar crashes por JSON malformado:

```typescript
let body: unknown;
try {
  body = await request.json();
} catch {
  return validationErrorResponse('Invalid request body');
}
```

### Schema público de pedidos — límites anti-abuso

El schema de `POST /api/pedidos` incluye restricciones para prevenir payloads abusivos:

```typescript
items: z.array(...).min(1).max(50)
item.name: z.string().max(200)
item.price: z.number().min(0).max(100_000)
quantity: z.number().min(1).max(100)
selectedComplements: z.array(...).max(20)
```

---

## Seguridad en uploads de imágenes

El endpoint `POST /api/admin/upload-image` aplica:

1. **Validación MIME type** contra lista blanca: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
2. **Validación magic bytes** — verifica la cabecera binaria real del archivo, no solo el MIME declarado por el cliente
3. **Límite de tamaño**: 10 MB máximo
4. **Path seguro**: el nombre de fichero del cliente nunca se usa en la ruta de R2 — se genera `{slug}/{año}/{mes}/{uuid}.{ext}`
5. **Slug desde DB**: el slug de la empresa se obtiene de la base de datos, nunca del cliente

---

## Aislamiento multi-tenant

- El proxy extrae `empresaId` del JWT verificado e inyecta `x-empresa-id` en los headers de cada request
- `requireAuth()` lee ese header — no acepta el header si el proxy no lo inyectó
- Todos los repositorios filtran por `empresaId` en cada query
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

---

## CORS

Configurado en el proxy para rutas `/api/*`. Solo se permiten orígenes definidos en:

- `CORS_ALLOWED_ORIGINS` — lista exacta de orígenes separada por comas
- `CORS_ALLOWED_DOMAINS` — dominios (incluye subdominios)
- `http://localhost:*` — permitido automáticamente en desarrollo

---

## Variables de entorno requeridas

| Variable | Uso |
|----------|-----|
| `ACCESS_TOKEN_SECRET` | Firma JWT de sesión admin |
| `CSRF_HMAC_SECRET` | Firma HMAC de tokens CSRF |
| `CART_TOKEN_SECRET` | JWT de acceso al carrito |
| `NEXT_PUBLIC_R2_DOMAIN` | Dominio público de imágenes R2 (incluye protocolo) |
| `UPSTASH_REDIS_REST_URL` | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `BREVO_API_KEY` | Envío de emails transaccionales |
| `BREVO_DEFAULT_SENDER_EMAIL` | Remitente por defecto si la empresa no tiene `emailNotification` configurado |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos en CORS |
| `CORS_ALLOWED_DOMAINS` | Dominios permitidos en CORS |

---

## Pendiente / mejoras futuras

- **Revocación de JWT** — los tokens son válidos hasta su expiración (24h) incluso tras logout. Solución: blocklist en Redis por `jti` o tokens de corta duración con refresh token.
- **Nonce en API routes** — las respuestas de API reciben el CSP de fallback de `next.config.mjs`. No es un riesgo real (son JSON), pero podría unificarse.
- **Endpoint `/api/csp-report`** — referenciado como ruta pública pero no implementado. Las violaciones CSP del navegador no se capturan.
- **`X-Frame-Options: DENY`** en páginas admin — actualmente el header global es `SAMEORIGIN`; las rutas `/admin/*` tienen `DENY` solo en `next.config.mjs` pero el proxy podría reforzarlo también.
