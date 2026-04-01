# Carta Digital Multi-idioma

Plataforma multi-tenant de menú digital con sistema de pedidos online, panel de administración y envío de promociones por email.

## Stack Tecnológico

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 (Turbopack) | Framework full-stack |
| React | 19.2.0 | UI Library |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | BBDD + Auth |
| Cloudflare R2 | — | Storage imágenes |
| Tailwind CSS | 4.x | Estilos |
| AWS SDK v3 | ^3.994 | Cliente S3/R2 |
| Zod | 3.25.x | Validación schemas |
| jose | ^6.1.3 | JWT (sign + verify) |
| Upstash Redis | — | Rate limiting + JWT revocation |
| Brevo | — | Envío de emails |

---

## Arquitectura — Clean Architecture

```
┌─────────────────────────────────────────────────────────┐
│            API Routes / Pages (Presentación)            │
│  - Validación Zod (safeParse)                           │
│  - requireAuth, successResponse, errorResponse          │
│  - Pages admin usan authAdminUseCase.verifyToken()      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│               Use Cases (Aplicación)                    │
│  - ProductUseCase, CategoryUseCase, ClienteUseCase      │
│  - EmpresaUseCase, PedidoUseCase, PromocionUseCase      │
│  - AuthAdminUseCase, TgtgUseCase                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Repositories (Infraestructura)              │
│  - IProductRepository, ICategoryRepository              │
│  - IClienteRepository, IEmpresaRepository               │
│  - IPedidoRepository, IPromocionRepository              │
│  - IAdminRepository                                     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│               Supabase / R2 (Implementación)            │
│  - getSupabaseClient()     → service role               │
│  - getSupabaseAnonClient() → anon key                   │
│  - getS3Client()           → Cloudflare R2              │
└─────────────────────────────────────────────────────────┘
```

### Estructura de directorios

```
src/
├── app/
│   ├── layout.tsx                   # Root layout (multi-tenant, nonce CSP)
│   ├── page.tsx                     # Menú público (SSR)
│   ├── admin/
│   │   ├── login/                   # Login admin
│   │   └── (protected)/             # Rutas protegidas (SSR)
│   │       ├── layout.tsx           # Verifica sesión con authAdminUseCase
│   │       ├── page.tsx             # Dashboard
│   │       ├── productos/
│   │       ├── categorias/
│   │       ├── pedidos/
│   │       ├── clientes/
│   │       ├── promociones/
│   │       ├── toogoodtogo/             # Campañas TGTG (crear, enviar, gestionar)
│   │       ├── estadisticas/
│   │       └── configuracion/
│   ├── superadmin/                  # Panel Super Admin
│   │   ├── layout.tsx               # Verifica rol superadmin
│   │   ├── page.tsx                 # Dashboard global
│   │   └── empresas/[id]/page.tsx   # Editar empresa
│   └── api/
│       ├── admin/                   # Protegidas por proxy.ts JWT
│       │   ├── login/               # POST — autenticación
│       │   ├── logout/              # POST — cerrar sesión
│       │   ├── productos/           # CRUD productos
│       │   ├── categorias/          # CRUD categorías
│       │   ├── pedidos/             # GET/PATCH/DELETE + PUT (stats)
│       │   │   └── enviar-email/    # POST — email confirmación al admin
│       │   ├── upload-image/        # POST — upload imágenes a R2
│       │   ├── clientes/            # CRUD clientes
│       │   ├── empresa/             # GET/PUT datos empresa
│       │   ├── update-colores/      # POST colores del tema
│       │   ├── tgtg/                # GET all, POST crear campaña
│       │   │   ├── [id]/            # DELETE campaña (guarda vs emailEnviado/reservas)
│       │   │   └── enviar/          # POST — enviar emails campaña activa
│       │   └── promociones/
│       │       └── unsubscribe/     # POST — pública, toggle suscripción
│       ├── superadmin/              # Protegidas, rol superadmin
│       │   └── empresas/
│       │       ├── route.ts         # GET — todas las empresas
│       │       └── [id]/route.ts   # GET/PUT — empresa específica
│       ├── pedidos/                 # POST — pública, crear pedido
│       └── unsubscribe/             # GET — pública, dar de baja/alta promo
│
├── core/                            # Clean Architecture
│   ├── domain/
│   │   ├── entities/types.ts        # Tipos de dominio
│   │   ├── repositories/            # Interfaces I*Repository
│   │   └── constants/
│   │       ├── api-errors.ts        # Códigos de error centralizados
│   │       ├── pedido.ts            # Estados y labels de pedido
│   │       └── empresa-defaults.ts  # Colores y configuración por defecto
│   ├── application/
│   │   ├── dtos/                    # Schemas Zod por entidad
│   │   └── use-cases/               # Un use case por entidad
│   └── infrastructure/
│       ├── api/
│       │   ├── helpers.ts           # requireAuth, handleResult (error code → HTTP status), responses
│       │   ├── rate-limit.ts        # rateLimitLogin (fail-closed prod), rateLimitPublic, rateLimitAdmin
│       │   └── api-logger.ts        # logApiError
│       ├── database/
│       │   ├── supabase-client.ts   # Singletons Supabase
│       │   └── index.ts             # Inyección de dependencias
│       ├── logging/logger.ts        # ErrorLogger singleton
│       ├── storage/s3-client.ts     # Singleton R2
│       └── env-validation.ts        # Validación de env vars al startup
│
├── instrumentation.ts               # Next.js startup hook → validateEnv()
├── proxy.ts                         # Middleware JWT + CSRF + CSP nonce + CORS
│
└── lib/
    ├── csrf.ts                      # HMAC-SHA256 tokens CSRF (timingSafeEqual)
    ├── domain-utils.ts              # parseMainDomain(), getDomainFromHeaders()
    ├── html-utils.ts                # escapeHtml()
    ├── token-revocation.ts          # JWT revocation list (Upstash Redis REST)
    ├── unsubscribe-token.ts         # HMAC tokens para unsubscribe (TTL 1 año, GDPR)
    ├── brevo-email.ts               # sendEmail()
    ├── server-services.ts           # getEmpresaByDomain(), getMenuUseCase
    ├── admin-context.tsx            # AdminContext (empresaId, empresaNombre)
    ├── cart-context.tsx             # CartContext
    └── translations.ts              # Traducciones i18n (es/en/fr/it/de)
```

---

## Seguridad

Documentación completa en [`docs/context/security.md`](docs/context/security.md).

| Área | Implementación |
|------|----------------|
| **Autenticación** | JWT HS256 en cookie HttpOnly + SameSite strict, jti claim, 24h expiry, runtime guard en secret |
| **JWT Revocation** | Verificada en proxy (API) y `verifyToken` (pages SSR). Fail-closed en producción |
| **Autorización** | `proxy.ts` verifica JWT e inyecta `x-empresa-id` por tenant |
| **CSRF** | Token HMAC-SHA256 verificado con `timingSafeEqual`, Cache-Control no-store |
| **CSP** | Nonce criptográfico por request en `proxy.ts`, sin `unsafe-inline` en scripts |
| **Rate limiting** | Upstash Redis — 5/15min login (fail-closed en prod), 20/min público, 60/min admin |
| **Env validation** | `instrumentation.ts` → `validateEnv()` al startup, falla fatal en producción |
| **Validación** | Zod `safeParse` + try/catch en `request.json()` + max-length en todos los DTOs |
| **Uploads** | Validación MIME + magic bytes + tamaño + path seguro (slug desde DB) |
| **Multi-tenant** | Aislamiento por `empresaId` en cada query, RLS + service_role |
| **Mínimo privilegio** | Endpoints públicos usan `empresaPublicRepository` (anon key) para lecturas |
| **XSS emails** | `escapeHtml()` en todos los templates HTML, logging centralizado sin PII |
| **Price tampering** | Total recalculado server-side + rechazo de productos desconocidos (`PRODUCT_NOT_FOUND`) |
| **Anti-enumeración** | Login devuelve mensaje genérico para todos los tipos de fallo auth |
| **RBAC** | `requireRole(request, ['admin'])` en todos los handlers mutativos de `/api/admin/*` |
| **Unsubscribe** | HMAC-SHA256 con `UNSUBSCRIBE_HMAC_SECRET` dedicado, TTL 1 año (GDPR/CAN-SPAM), acción explícita `'baja'` |
| **CORS** | Whitelist de dominios, `Vary: Origin`, preflight 204, headers en rutas públicas |
| **Cart tokens** | Validación con audience claim `'cart-access'` para prevenir token confusion |
| **JSON-LD** | Sanitización de `<`, `>`, `&` para prevenir inyección en script tags |
| **Headers** | HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy |
| **URL schemes** | DTOs validan `https://` en fb, instagram, logo_url, url_mapa, foto_url, imagen_url |
| **Error mapping** | `handleResult()` mapea error codes a HTTP status (400, 401, 404, 500) |
| **Pedido atómico** | `get_next_pedido_number()` con mutex por tenant |

---

## Principios Aplicados

### Clean Architecture

| Capa | Contenido |
|------|-----------|
| **Domain** | `entities/types.ts`, `repositories/I*.ts`, `constants/` |
| **Application** | `dtos/*.ts`, `use-cases/*.ts` |
| **Infrastructure** | `database/*.ts`, `storage/*.ts`, `api/helpers.ts` |

Reglas estrictas:
- **NUNCA** acceder a DB directamente desde routes o pages
- **SIEMPRE** pasar por: Use Case → Repository → Supabase
- **NUNCA** llamar `createClient()` fuera de `supabase-client.ts`

### SOLID

- **Dependency Inversion**: repositorios inyectados por constructor, instanciados en `index.ts`
- Sin `any` — se usan tipos de dominio o `Record<string, unknown>`

```typescript
// ✅ BIEN — depende de abstracción
export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}
}
```

---

## Helpers de API

```typescript
// Autenticación — obligatorio en todas las rutas /api/admin/*
const { empresaId, error: authError } = await requireAuth(request);
if (authError) return authError;

// Respuestas consistentes
return successResponse(data);             // 200 OK
return successResponse(data, 201);        // 201 Created
return errorResponse('msg', 404);         // 404 Not Found
return validationErrorResponse('msg');    // 400 Bad Request
return handleResult(result);             // automático desde Result<T> (mapea error codes a HTTP status)
```

`handleResult` mapea automáticamente códigos de error a HTTP status:
- `VALIDATION_ERROR` → 400, `AUTH_*` → 401, `*_NOT_FOUND` → 404, otros → 500

## Códigos de Error Centralizados

```typescript
import { AUTH_ERRORS, VALIDATION_ERRORS, SERVER_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

// Uso en rutas
return NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 });
```

| Prefijo | Códigos | Ejemplos |
|---------|---------|---------|
| `AUTH_` | AUTH_001–005 | UNAUTHORIZED, INVALID_TOKEN, CSRF_REQUIRED |
| `VAL_` | VAL_002–004 | MISSING_FILE, FILE_TOO_LARGE, INVALID_FILE_TYPE |
| `SRV_` | SRV_002–005 | CONFIG_ERROR, STORAGE_ERROR, DATABASE_ERROR |

---

## Repositorios y Use Cases

```typescript
import {
  productUseCase, categoryUseCase, clienteUseCase,
  empresaUseCase, pedidoUseCase, promocionUseCase,
  authAdminUseCase, tgtgUseCase, empresaRepository,
} from '@/core/infrastructure/database';
```

| Use Case | Métodos |
|----------|---------|
| **ProductUseCase** | `getAll`, `create`, `update`, `delete` |
| **CategoryUseCase** | `getAll`, `create`, `update`, `delete` |
| **ClienteUseCase** | `getAll`, `create`, `update`, `delete`, `togglePromoSubscription` |
| **EmpresaUseCase** | `getById`, `update`, `updateColores` |
| **PedidoUseCase** | `getAll`, `create`, `updateStatus`, `getStats`, `delete` |
| **PromocionUseCase** | `getAll`, `create` |
| **AuthAdminUseCase** | `login`, `verifyToken` |
| **TgtgUseCase** | `getWithItems`, `getAllRecent`, `create`, `sendCampaignEmails`, `markEmailSent`, `getHistory`, `getReservas`, `adjustCupones`, `claimCupon`, `updateHoras`, `deletePromo`, `isTokenUsed`, `getPublicItem`, `getPublicPromo` |
| **SuperAdminUseCase** | `getAllEmpresas`, `getEmpresaById`, `updateEmpresa` |

### Repositories — métodos

| Repository | Métodos |
|------------|---------|
| **IAdminRepository** | `loginWithPassword`, `findById` |
| **ISuperAdminRepository** | `findAllEmpresas`, `findEmpresaById`, `updateEmpresa`, `getEmpresaStats` |
| **IClienteRepository** | `findAllByTenant`, `findByEmail`, `findByTelefono`, `create`, `update`, `delete` |
| **IEmpresaRepository** | `getById`, `findByDomain`, `update`, `updateColores` |
| **IPedidoRepository** | `findAllByTenant`, `updateStatus`, `delete`, `create`, `getStats` |
| **IPromocionRepository** | `findAllByTenant`, `create`, `deleteAllByTenant` |
| **IProductRepository** | `findAllByTenant`, `findByIds`, `create`, `update`, `delete` |
| **ICategoryRepository** | `findAllByTenant`, `create`, `update`, `delete` |
| **ILogErrorRepository** | `log` |
| **ITgtgRepository** | `findWithItems`, `findAllRecent`, `create`, `sendEmails`, `markEmailSent`, `findHistory`, `findReservas`, `adjustCupones`, `claimCupon`, `updateHoras`, `delete`, `isTokenUsed`, `findPublicItem`, `findPublicPromo` |

---

## Tipos de Dominio

```typescript
// core/domain/entities/types.ts

interface Empresa {
  id, nombre, dominio, logoUrl, mostrarCarrito, moneda,
  emailNotification, urlImage, colores: EmpresaColores | null,
  descripcion, fb?, instagram?, urlMapa?, direccion?, telefonoWhatsapp?
}

interface PedidoItem {
  producto_id?, nombre, precio, cantidad,
  complementos?: PedidoComplemento[]
}

interface PedidoComplemento {
  nombre?: string; name?: string;   // formato dual por compatibilidad
  precio?: number; price?: number;
}

interface CartItem {
  item?: { id, name, price };
  quantity: number;
  selectedComplements?: { name: string; price: number }[];
}
```

## Formato de Datos: Dominio vs Admin

Los repositories devuelven **camelCase** (dominio). Las API routes del admin transforman a **snake_case** usando los tipos correctos:

```typescript
import type { Product } from '@/core/domain/entities/types';

function toAdminProduct(prod: Product) {
  return {
    id: prod.id,
    empresa_id: prod.empresaId,
    categoria_id: prod.categoriaId,
    titulo_es: prod.titulo_es,
    foto_url: prod.fotoUrl,
    es_especial: prod.esEspecial,
    // ...
  };
}
```

---

## Autenticación Admin

### Roles de Usuario

El sistema soporta dos roles:

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `admin` | Admin de empresa | Panel admin de su empresa, solo datos de su tenant |
| `superadmin` | Super Admin | Panel superadmin, acceso a TODAS las empresas |

El rol se define en la columna `rol` de la tabla `perfiles_admin`:
- `admin` → redirige a `/admin`
- `superadmin` → redirige a `/superadmin`

### Panel Super Admin

Acceso: `/superadmin` - Ver resumen de todas las empresas y editar cualquier campo.

```
/superadmin                     → Dashboard con stats de todas las empresas
/superadmin/empresas/[id]      → Editar empresa específica
```

APIs asociadas:
```
/api/superadmin/empresas        → GET todas las empresas con stats
/api/superadmin/empresas/[id]  → GET/PUT empresa específica
```

### Flujo de login
```
POST /api/admin/login
  → AuthAdminUseCase.login()
  → adminRepo.loginWithPassword()  (Supabase Auth)
  → adminRepo.findById()           (perfil + empresa)
  → JWT HS256, 24h, jti=randomUUID()
  → cookie admin_token (HttpOnly, SameSite=strict)
  → Redirección según rol: admin → /admin, superadmin → /superadmin
```

### Flujo de logout
```
POST /api/admin/logout
  → jwtVerify(admin_token) → extrae jti + exp
  → revokeToken(jti, ttlRestante) → Upstash Redis SET key EX ttl
  → delete cookie admin_token + csrf_token
```

### Verificación de sesión en pages
```typescript
// app/admin/(protected)/layout.tsx  y  page.tsx
import { authAdminUseCase } from '@/core/infrastructure/database';

const token = cookieStore.get('admin_token')?.value;
if (!token) redirect('/admin/login');

const admin = await authAdminUseCase.verifyToken(token);
if (!admin) redirect('/admin/login');

// admin.empresaId, admin.empresa, admin.nombreCompleto
```

### Middleware (proxy.ts)
- Lee secrets de forma lazy (`getAdminTokenSecret()`) — nunca constantes a nivel de módulo
- Verifica JWT en todas las rutas `/api/admin/*`
- Comprueba revocación del `jti` en Redis (fail-closed en producción)
- Valida CSRF (timingSafeEqual) en todos los métodos mutativos
- Inyecta `x-empresa-id`, `x-admin-id`, `x-admin-rol` como headers
- Genera nonce criptográfico por request para rutas de página; emite CSP dinámico y pasa `x-nonce` a server components
- Aplica CORS headers a todas las rutas `/api/*` (admin y públicas)
- Valida cart access tokens con audience claim `'cart-access'`
- Rutas públicas sin JWT (match exacto): `/api/admin/login`, `/api/unsubscribe`, `/api/admin/promociones/unsubscribe`, `/api/csp-report`

> Agregar nuevas rutas públicas a `isPublicRoute` en `proxy.ts` (usar `===`, no `startsWith`)

> `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`

---

## Subdominios y Multi-tenant

| Host | Comportamiento |
|------|---------------|
| `midominio.com` | Menú sin carrito |
| `pedidos.midominio.com` | Menú + carrito |
| `midominio-pedidos.com` | Menú + carrito (dominio propio) |

```typescript
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';

const domain = await getDomainFromHeaders();
const main = parseMainDomain(domain); // elimina subdominio pedidos
```

---

## Base de Datos (Supabase)

| Tabla | PK | FK | Notas |
|-------|----|----|-------|
| `empresas` | id (uuid) | — | dominio, subdomain_pedidos, colores, fb, instagram, url_mapa, telefono_whatsapp |
| `perfiles_admin` | id (uuid) | empresa_id → empresas (nullable) | → auth.users, `rol` = 'admin' o 'superadmin' |
| `categorias` | id (uuid) | empresa_id → empresas | categoria_padre_id, categoriaComplementoDe |
| `productos` | id (uuid) | empresa_id, categoria_id | i18n: titulo_es/en/fr/it/de |
| `clientes` | id (uuid) | empresa_id | telefono único por empresa |
| `pedidos` | id (uuid) | empresa_id, cliente_id | numero_pedido (atómico por tenant), detalle_pedido: JSON (PedidoItem[]) |
| `promociones` | id (uuid) | empresa_id | imagen_url, numero_envios |
| `tgtg_promociones` | id (uuid) | empresa_id | fechaActivacion, horaRecogidaInicio/Fin, emailEnviado, numeroEnvios |
| `tgtg_items` | id (uuid) | tgtg_promo_id, empresa_id | titulo, precioOriginal, precioDescuento, cuponesTotal, cuponesDisponibles |
| `tgtg_reservas` | id (uuid) | tgtg_item_id, empresa_id | token único, estado (pendiente/confirmado/cancelado), fechaReserva |
| `log_errors` | id (uuid) | empresa_id | logging centralizado con severity y metadata JSONB |

> `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`

> `detalle_pedido[].complementos` almacena objetos `{ name, price }` — tipo `PedidoComplemento[]`

> `perfiles_admin.empresa_id` es NULL para superadmins (sin empresa asignada)

---

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Auth JWT
ACCESS_TOKEN_SECRET=secreto_largo_aleatorio        # openssl rand -hex 32

# CSRF + Carrito + Unsubscribe (obligatorios en producción)
CSRF_HMAC_SECRET=secreto_largo_aleatorio           # openssl rand -hex 32
CART_TOKEN_SECRET=secreto_largo_aleatorio          # openssl rand -hex 32
UNSUBSCRIBE_HMAC_SECRET=secreto_largo_aleatorio    # openssl rand -hex 32

# Rate Limiting + JWT Revocation (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# CORS
CORS_ALLOWED_ORIGINS=https://tudominio.com,https://pedidos.tudominio.com
CORS_ALLOWED_DOMAINS=tudominio.com

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://imagenes.tudominio.com
CLOUDFLARE_API_TOKEN=xxx                           # opcional, fallback a AWS SDK

# Email (Brevo)
BREVO_API_KEY=xxx
BREVO_DEFAULT_SENDER_EMAIL=noreply@tudominio.com
```

---

## Imágenes (Cloudflare R2)

### Estructura en bucket

```
{empresa-slug}/{año}/{mes}/{uuid}.webp
```

### Flujo de upload

1. Cliente optimiza imagen en browser (480×480, WebP, 80%) — `components/ui/image-uploader.tsx`
2. `POST /api/admin/upload-image` con `FormData`
3. El API route valida MIME type, magic bytes y tamaño
4. Deriva `empresaSlug` desde DB — nunca del cliente
5. Upload a R2 y devuelve `{ publicUrl }`

```typescript
import { deleteImageFromR2, uploadToR2 } from '@/core/infrastructure/storage/s3-client';
```

---

## Comandos

```bash
pnpm dev      # Desarrollo con Turbopack
pnpm build    # Build de producción
pnpm lint     # Linting

# Solo una vez: configurar CORS en R2
npx tsx scripts/setup-r2-cors.ts
```

---

## Crear Super Admin

### Requisitos de Base de Datos

El campo `empresa_id` en `perfiles_admin` debe permitir NULL para superadmins:

```sql
ALTER TABLE public.perfiles_admin 
ALTER COLUMN empresa_id DROP NOT NULL;

ALTER TABLE public.perfiles_admin 
DROP CONSTRAINT IF EXISTS perfiles_admin_empresa_id_fkey;
```

### Script Node (recomendado)

```bash
# Crear archivo .env desde .env.local si no existe
cp .env.local .env

# Crear superadmin
npx tsx scripts/create-superadmin.ts superadmin@tudominio.com Password123 "Super Admin"
```

### Script SQL (alternativa)

```sql
-- 1. Crear usuario en Auth (reemplazar valores)
INSERT INTO auth.users (instance_id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, id)
VALUES (
  (SELECT id FROM auth.instances LIMIT 1),
  'superadmin@tudominio.com',
  crypt('Password123', gen_salt('bf')),
  now(),
  NULL,
  'authenticated',
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  gen_random_uuid()
) RETURNING id;

-- 2. Crear perfil (reemplazar USER_ID)
INSERT INTO public.perfiles_admin (id, empresa_id, nombre_completo, rol, created_at)
VALUES ('USER_ID_AQUI', NULL, 'Super Admin', 'superadmin', now());
```

### Convertir admin existente a superadmin

```sql
UPDATE public.perfiles_admin 
SET rol = 'superadmin', empresa_id = NULL
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@connect.com');
```

---

## Estado del Proyecto

| Aspecto | Estado |
|---------|--------|
| **Build** | Compila correctamente |
| **Clean Architecture** | 100% — Domain / Application / Infrastructure |
| **SOLID** | 100% — DIP, sin `any`, repositorios inyectados |
| **Seguridad** | Auditoría completa — JWT revocation (fail-closed), RBAC `requireRole`, env validation startup, rate limiting (fail-closed login), CSP nonces + report-uri, CSRF timing-safe, price tampering + product rejection, anti-enumeración, mínimo privilegio, cart token audience, JSON-LD sanitización |
| **Tipos TypeScript** | Sin `any` en core ni API routes |
| **Error Handling** | 100% — Result<T, E> en todos los módulos |
| **API Error Codes** | Códigos centralizados en `core/domain/constants/api-errors.ts` |
| **Logging** | Tabla log_errors + ErrorLogger singleton |
| **UI/UX** | Audit 8.5/10 — WCAG AA, focus states, reduced-motion, ARIA, mobile-first, 44px touch targets |
| **i18n** | es/en/fr/it/de en productos + panel admin + componentes públicos |

## Documentación

- [`docs/context/security.md`](docs/context/security.md) — Medidas de seguridad detalladas
- [`docs/context/bbdd.md`](docs/context/bbdd.md) — Esquema de base de datos
- [`docs/context/cart_flow.md`](docs/context/cart_flow.md) — Flujo del carrito
- [`docs/context/context.md`](docs/context/context.md) — Contexto general del proyecto
- [`docs/context/toogoodtogo.md`](docs/context/toogoodtogo.md) — Flujo completo TGTG (campañas, reservas, emails, reglas de negocio)

---

## Deployment (Vercel)

1. Conectar repo a Vercel
2. Configurar todas las variables de entorno
3. Framework Preset: Next.js
4. Deploy automático en push a `main`

> Next.js 16 usa Turbopack — es normal ver "Skipping validation of types" en el build.
