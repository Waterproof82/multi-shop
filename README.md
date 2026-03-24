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
| Upstash Redis | — | Rate limiting |
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
│  - AuthAdminUseCase                                     │
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
│   │       ├── estadisticas/
│   │       └── configuracion/
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
│       │   └── promociones/
│       │       └── unsubscribe/     # POST — pública, toggle suscripción
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
│       │   ├── helpers.ts           # requireAuth, handleResult, responses
│       │   ├── rate-limit.ts        # rateLimitLogin, rateLimitPublic, rateLimitAdmin
│       │   └── api-logger.ts        # logApiError
│       ├── database/
│       │   ├── supabase-client.ts   # Singletons Supabase
│       │   └── index.ts             # Inyección de dependencias
│       ├── logging/logger.ts        # ErrorLogger singleton
│       └── storage/s3-client.ts     # Singleton R2
│
├── proxy.ts                         # Middleware JWT + CSRF + CSP nonce
│
└── lib/
    ├── csrf.ts                      # Generación y verificación CSRF (HMAC)
    ├── domain-utils.ts              # parseMainDomain(), getDomainFromHeaders()
    ├── html-utils.ts                # escapeHtml()
    ├── brevo-email.ts               # sendEmail()
    └── translations.ts              # Traducciones i18n
```

---

## Seguridad

La seguridad está documentada en detalle en [`docs/context/security.md`](docs/context/security.md). Resumen:

| Área | Implementación |
|------|----------------|
| **Autenticación** | JWT HS256 en cookie HttpOnly + SameSite |
| **Autorización** | `proxy.ts` verifica JWT e inyecta `x-empresa-id` por tenant |
| **CSRF** | Token HMAC-SHA256 verificado con `timingSafeEqual` |
| **CSP** | Nonce por request generado en `proxy.ts`, sin `unsafe-inline` en scripts |
| **Rate limiting** | Upstash Redis — 5/15min login, 20/min público, 60/min admin |
| **Validación** | Zod `safeParse` en todas las rutas + try/catch en `request.json()` |
| **Uploads** | Validación MIME + magic bytes + tamaño + path seguro |
| **Multi-tenant** | Aislamiento por `empresaId` en cada query |
| **XSS emails** | `escapeHtml()` en todos los templates HTML |
| **Headers** | HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy |

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
return handleResult(result);             // automático desde Result<T>
```

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
  authAdminUseCase, empresaRepository,
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

> ⚠️ `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`

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

| Tabla | PK | Notas |
|-------|----|-------|
| `empresas` | uuid | dominio, subdomain_pedidos, colores, contacto |
| `perfiles_admin` | uuid | FK empresa_id → auth.users |
| `categorias` | uuid | categoria_padre_id, categoriaComplementoDe |
| `productos` | uuid | i18n: titulo_es/en/fr/it/de |
| `clientes` | uuid | telefono único por empresa |
| `pedidos` | uuid | detalle_pedido: JSON (PedidoItem[]) |
| `promociones` | uuid | imagen_url, numero_envios |
| `log_errors` | uuid | logging centralizado con severity y metadata |

---

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Auth y seguridad
ACCESS_TOKEN_SECRET=secreto_largo_aleatorio
CSRF_HMAC_SECRET=secreto_largo_aleatorio
CART_TOKEN_SECRET=secreto_largo_aleatorio

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://tudominio.com   # incluir https://

# Rate limiting
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Email (Brevo)
BREVO_API_KEY=xxx
BREVO_DEFAULT_SENDER_EMAIL=noreply@tudominio.com

# CORS
CORS_ALLOWED_ORIGINS=https://tudominio.com,https://pedidos.tudominio.com
CORS_ALLOWED_DOMAINS=tudominio.com
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

## Estado del Proyecto

| Aspecto | Estado |
|---------|--------|
| **Build** | ✅ Compila sin errores |
| **Clean Architecture** | ✅ Domain / Application / Infrastructure |
| **SOLID** | ✅ DIP, sin `any`, repositorios inyectados |
| **Seguridad** | ✅ JWT, CSRF timingSafeEqual, CSP nonce, rate limiting, validación |
| **Result\<T\>** | ✅ Patrón aplicado en use cases y repositories |
| **API Error Codes** | ✅ Códigos centralizados AUTH/VAL/SRV |
| **Logging** | ✅ Tabla `log_errors` + ErrorLogger singleton |
| **i18n** | ✅ es/en/fr/it/de en productos + panel admin traducido |
| **UI/UX** | ✅ Focus states, reduced-motion, ARIA, mobile-first |

## Documentación

- [`docs/context/security.md`](docs/context/security.md) — Medidas de seguridad detalladas
- [`docs/context/bbdd.md`](docs/context/bbdd.md) — Esquema de base de datos
- [`docs/context/cart_flow.md`](docs/context/cart_flow.md) — Flujo del carrito
- [`docs/context/context.md`](docs/context/context.md) — Contexto general del proyecto

---

## Deployment (Vercel)

1. Conectar repo a Vercel
2. Configurar todas las variables de entorno
3. Framework Preset: Next.js
4. Deploy automático en push a `main`

> Next.js 16 usa Turbopack — es normal ver "Skipping validation of types" en el build.
