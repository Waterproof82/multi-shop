# AGENTS.md - Contexto para Agentes IA

## Regla de documentación externa

When writing code that uses any external library, always use context7 to get current documentation before generating code.

## Stack
Next.js 16 + React 19 + TypeScript + Supabase + Tailwind CSS v4 + Cloudflare R2 + Upstash Redis (rate limiting)

**Nota:** Next.js 16 usa Turbopack por defecto en desarrollo.

## Arquitectura - Clean Architecture 100%

```
API Routes → Use Cases → Repositories → Supabase/R2
```

### Capas (obligatorias)

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| **Domain** | `core/domain/` | Entidades, interfaces de repositorios |
| **Application** | `core/application/` | DTOs (Zod), Use Cases, Mappers |
| **Infrastructure** | `core/infrastructure/` | Implementaciones de repositories |

### Flujo obligatorio

```typescript
// 1. API Route valida con Zod y llama Use Case
import { productUseCase } from '@/core/infrastructure/database';
import { createProductSchema } from '@/core/application/dtos/product.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import type { Product } from '@/core/domain/entities/types';

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = createProductSchema.safeParse({ ...body, empresaId });
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const product = await productUseCase.create(parsed.data);
  return successResponse(product, 201);
}

// 2. Use Case contiene lógica de negocio
// 3. Repository abstrae la base de datos
```

## Principios a Seguir (OBLIGATORIOS)

### Clean Architecture
- **NUNCA** acceder a la DB directamente desde API routes ni pages
- **SIEMPRE** pasar por: Use Case → Repository → Supabase
- Usar los singletons: `getSupabaseClient()` (service role) o `getSupabaseAnonClient()` (anon)
- Las pages del panel admin verifican sesión usando `authAdminUseCase.verifyToken(token)` — **nunca** llamar a `jwtVerify` ni `adminRepository` directamente desde pages

### SOLID - Dependency Inversion
- Depender de **interfaces** (abstracciones), no de implementaciones
- **BIEN**: `constructor(private readonly repo: IProductRepository)`
- **MAL**: `const supabase = createClient(url, key)` fuera de `supabase-client.ts`
- **BIEN**: repositorios reciben cliente via constructor, instanciados en `database/index.ts`
- **MAL**: usar `any` como tipo — usar `Record<string, unknown>` con casts explícitos o tipos de dominio

### OWASP
- JWT con cookies **HttpOnly**, `Secure` (prod), `SameSite: lax`
- Zod validation en **TODAS** las API routes con `safeParse`
- HTML escapado antes de insertar en emails (`escapeHtml` de `lib/html-utils.ts`)
- Validación de formato hexadecimal `#RRGGBB` para colores
- Validación de teléfono con regex: `/^\+?[0-9\s\-()]+$/`
- No hardcodear secrets ni URLs de fallback
- Security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy (en `next.config.mjs`)
- **TODAS** las rutas bajo `/api/admin/*` deben llamar `requireAuth` (el proxy inyecta `x-empresa-id`)
- Rutas públicas con redirects: derivar `baseUrl` del request (`new URL(request.url)`), **NUNCA** de env vars

## Estructura clave

```
src/
├── app/api/admin/              # Rutas API con Zod validation + requireAuth
├── app/api/pedidos/            # Ruta pública: crear pedido (sin auth)
├── app/api/unsubscribe/        # Ruta pública: gestión suscripción promo
├── core/
│   ├── domain/
│   │   ├── entities/types.ts   # Tipos: Product, Category, Empresa, EmpresaPublic, EmpresaColores,
│   │   │                       #        Pedido, PedidoItem, PedidoComplemento, CartItem,
│   │   │                       #        Cliente, Promocion
│   │   └── repositories/       # Interfaces: IProductRepository, IAdminRepository,
│   │                           #             IClienteRepository, IEmpresaRepository,
│   │                           #             IPedidoRepository, IPromocionRepository,
│   │                           #             ICategoryRepository
│   ├── application/
│   │   ├── dtos/               # Zod schemas: product.dto.ts, category.dto.ts,
│   │   │                       #              cliente.dto.ts, empresa.dto.ts, auth.dto.ts
│   │   ├── use-cases/          # Lógica de negocio
│   │   └── mappers/            # Transformación dominio → view model (MenuMapper)
│   └── infrastructure/
│       ├── api/
│       │   ├── helpers.ts       # requireAuth, successResponse, errorResponse, validationErrorResponse
│       │   └── rate-limit.ts    # rateLimitLogin, rateLimitPublic (Upstash Redis)
│       ├── database/
│       │   ├── supabase-client.ts  # DOS singletons: getSupabaseClient() y getSupabaseAnonClient()
│       │   └── index.ts            # Instanciación e inyección de dependencias (exporta use cases y repos)
│       └── storage/
│           └── s3-client.ts        # Singleton R2: getS3Client(), getR2Config(), deleteImageFromR2()
├── components/
│   ├── ui/                     # ImageUploader, Button, Dialog, Sheet, Toast, etc.
│   └── promo-notification.tsx  # Banner notificación unsubscribe/subscribe (lee query params)
└── lib/
    ├── domain-utils.ts         # parseMainDomain(), getDomainFromHeaders() — usar en lugar de duplicar
    ├── html-utils.ts           # escapeHtml() — usar en emails
    ├── server-services.ts      # getEmpresaByDomain() (via empresaPublicRepository), getMenuUseCase
    ├── admin-context.tsx        # AdminContext (empresaId, empresaNombre)
    └── cart-context.tsx         # CartContext
```

## Helpers de API (OBLIGATORIOS USAR)

```typescript
// core/infrastructure/api/helpers.ts

// Autenticación - usar en TODAS las rutas protegidas /api/admin/*
const { empresaId, error } = await requireAuth(request);
if (error) return error;

// Respuestas consistentes
return successResponse(data);           // 200 OK
return successResponse(data, 201);      // 201 Created
return errorResponse('msg');            // 500 Error
return errorResponse('msg', 404);       // 404 Not Found
return validationErrorResponse('msg'); // 400 Bad Request
```

## Helper de dominio (OBLIGATORIO para parsear hosts)

```typescript
// lib/domain-utils.ts — importar siempre desde aquí, NO duplicar

import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';

const domain = await getDomainFromHeaders();   // extrae host del request
const mainDomain = parseMainDomain(domain);    // elimina subdominio pedidos
```

## Repositorios y Use Cases Disponibles

```typescript
// Importar desde core/infrastructure/database
import {
  productUseCase,       // ProductUseCase
  categoryUseCase,      // CategoryUseCase
  clienteUseCase,       // ClienteUseCase
  empresaUseCase,       // EmpresaUseCase
  pedidoUseCase,        // PedidoUseCase
  promocionUseCase,     // PromocionUseCase
  authAdminUseCase,     // AuthAdminUseCase
  empresaRepository,       // IEmpresaRepository (service role, para rutas admin)
  empresaPublicRepository, // IEmpresaRepository (anon key, para findByDomainPublic en páginas públicas)
} from '@/core/infrastructure/database';
```

### Constantes de Dominio

```typescript
// core/domain/constants/empresa-defaults.ts
import { DEFAULT_EMPRESA_COLORES } from '@/core/domain/constants/empresa-defaults';
import { DEFAULT_PEDIDOS_SUBDOMAIN } from '@/core/domain/constants/empresa-defaults';

// core/domain/constants/pedido.ts
import { PEDIDO_ESTADOS, PEDIDO_ESTADO_LABELS, PEDIDO_ESTADO_COLORS } from '@/core/domain/constants/pedido';
```

### Tipos de Datos en Domain Repositories

Las interfaces de repositorios definen sus propios tipos de datos de entrada (no importan DTOs de Application):

```typescript
// core/domain/repositories/IProductRepository.ts
export interface CreateProductData { empresaId: string; titulo_es: string; ... }
export interface UpdateProductData extends Partial<CreateProductData> { id: string; }

// core/domain/repositories/ICategoryRepository.ts
export interface CreateCategoryData { empresaId: string; nombre_es: string; ... }

// core/domain/repositories/IEmpresaRepository.ts
export interface UpdateEmpresaData { email_notification?: string; ... }
```

Los DTOs de Zod (Application layer) son estructuralmente compatibles con estos tipos.

### Métodos de Use Cases

| Use Case | Métodos |
|----------|---------|
| **ProductUseCase** | `getAll`, `create`, `update`, `delete` |
| **CategoryUseCase** | `getAll`, `create`, `update`, `delete` |
| **ClienteUseCase** | `getAll`, `create`, `update`, `delete`, `togglePromoSubscription` |
| **EmpresaUseCase** | `getById`, `update`, `updateColores` |
| **PedidoUseCase** | `getAll`, `create`, `updateStatus`, `getStats`, `delete` |
| **PromocionUseCase** | `getAll`, `create` |
| **AuthAdminUseCase** | `login`, `verifyToken` |

### Métodos de Repositories

| Repository | Métodos |
|------------|---------|
| **IAdminRepository** | `loginWithPassword`, `findById` |
| **IClienteRepository** | `findAllByTenant`, `findByEmail`, `findByTelefono`, `create`, `update`, `delete` |
| **IEmpresaRepository** | `getById`, `findByDomain`, `findByDomainPublic`, `update`, `updateColores` |
| **IPedidoRepository** | `findAllByTenant`, `updateStatus`, `delete`, `create`, `getStats` |
| **IPromocionRepository** | `findAllByTenant`, `create`, `deleteAllByTenant` |
| **ICategoryRepository** | `findAllByTenant`, `create`, `update`, `delete` |
| **IProductRepository** | `findAllByTenant`, `create`, `update`, `delete` |

### Entidades del Dominio (domain/entities/types.ts)

```typescript
interface Empresa {
  id, nombre, dominio, logoUrl, mostrarCarrito, moneda,
  emailNotification, urlImage, colores, descripcion,
  // Campos de contacto (opcionales):
  fb?, instagram?, urlMapa?, direccion?, telefonoWhatsapp?
}

interface PedidoComplemento {
  nombre?: string; name?: string;   // ambos formatos por compatibilidad
  precio?: number; price?: number;
}

interface PedidoItem {
  producto_id?, nombre, precio, cantidad,
  complementos?: PedidoComplemento[]  // array de objetos, NO strings
}

interface CartItem {
  item?: { id, name, price };
  quantity: number;
  selectedComplements?: { name: string; price: number }[];
}
```

### Formato de Datos: Dominio vs Admin

Los repositories devuelven formato **dominio** (camelCase). Las rutas API del admin deben transformar al formato **admin** (snake_case):

```typescript
// API Route - transformar dominio → admin usando tipos correctos
import type { Product } from '@/core/domain/entities/types';

function toAdminProduct(prod: Product) {
  return {
    id: prod.id,
    empresa_id: prod.empresaId,
    categoria_id: prod.categoriaId,
    titulo_es: prod.titulo_es,
    // ...
  };
}
```

## Supabase - Clientes Singleton

```typescript
// core/infrastructure/database/supabase-client.ts

// Service Role (para operaciones admin/backend)
getSupabaseClient()       // usa SUPABASE_SERVICE_ROLE_KEY

// Anon Key (para lectura pública y auth.signInWithPassword)
getSupabaseAnonClient()   // usa NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Reglas:**
- **NUNCA** llamar `createClient()` fuera de `supabase-client.ts`
- Los repositorios reciben el cliente via constructor e `index.ts` los instancia
- `SupabaseAdminRepository` recibe ambos clientes: `(supabase, supabaseAnon)`
- `lib/supabaseClient.ts` fue eliminado — no recrear

## Supabase - Estructura de Tablas

| Tabla | PK | FK | Notas |
|-------|----|----|-------|
| `empresas` | id (uuid) | - | dominio, subdomain_pedidos, colores, logo_url, fb, instagram, url_mapa, direccion, telefono_whatsapp |
| `perfiles_admin` | id (uuid) | empresa_id → empresas | → auth.users |
| `categorias` | id (uuid) | empresa_id → empresas | categoria_padre_id, categoriaComplementoDe |
| `productos` | id (uuid) | empresa_id, categoria_id → categorias | i18n: titulo_es/en/fr/it/de |
| `clientes` | id (uuid) | empresa_id | telefono único |
| `pedidos` | id (uuid) | empresa_id, cliente_id → clientes | detalle_pedido (JSON array de PedidoItem) |
| `promociones` | id (uuid) | empresa_id → empresas | imagen_url, numero_envios |

**Notas críticas:**
- Tabla `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`
- `detalle_pedido[].complementos` almacena objetos `{ name, price }` — usar tipo `PedidoComplemento`

## Errores Comunes a Evitar

1. **NO usar `createClient` fuera de `supabase-client.ts`** — usar los singletons
2. **NO acceder a DB directamente desde rutas o pages** — usar siempre Use Cases → Repositories
3. **NO verificar JWT manualmente en pages** — usar `authAdminUseCase.verifyToken(token)`
4. **NO duplicar `parseMainDomain`/`getDomainFromHeaders`** — importar desde `lib/domain-utils.ts`
5. **NO usar `telefono` en pedidos** — la columna no existe
6. **NO insertar inputs de usuario directamente en HTML** — usar `escapeHtml` en emails
7. **NO tipar con `any`** — usar `Record<string, unknown>` con casts o tipos de dominio
8. **Subdominios** — buscar por `dominio` principal
9. **Imágenes R2** — usar cliente singleton, no crear nuevos clientes
10. **Colores** — validar formato `#RRGGBB` con regex

## Buenas Prácticas (OBLIGATORIAS)

- ✅ Usar `getSupabaseClient()` / `getSupabaseAnonClient()` según el caso
- ✅ Zod `safeParse` en **TODAS** las API routes
- ✅ Usar helpers: `requireAuth`, `successResponse`, `errorResponse`, `validationErrorResponse`
- ✅ Repositorios inyectados via constructor
- ✅ Labels con `htmlFor` para accessibility
- ✅ Props `Readonly<>` en interfaces de componentes
- ✅ `<Image>` de Next.js para imágenes
- ✅ `<Link>` de Next.js para navegación
- ✅ Tipos de dominio en vez de `any` (`Product`, `Category`, `PedidoItem`, etc.)

## Cosas importantes para el agente

### Footer
- Fondo negro, muestra logo, descripción, fb, instagram, dirección, WhatsApp, email y mapa (iframe)

### Panel Admin — Rutas
- `/admin/login` — Login
- `/admin` — Dashboard
- `/admin/productos` — CRUD productos
- `/admin/categorias` — CRUD categorías
- `/admin/pedidos` — Pedidos + estadísticas
- `/admin/clientes` — CRM clientes
- `/admin/promociones` — Envío masivo por email
- `/admin/configuracion` — Colores, contacto, redes

### Autenticación en pages del Admin

Las pages del panel admin verifican sesión así (sin `jwtVerify` manual):

```typescript
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';

const cookieStore = await cookies();
const token = cookieStore.get('admin_token')?.value;
if (!token) redirect('/admin/login'); // o return <div>No autorizado</div>

const admin = await authAdminUseCase.verifyToken(token);
if (!admin) redirect('/admin/login');

// admin.empresaId, admin.empresa, admin.nombreCompleto, etc.
```

### Middleware / Proxy
- `src/proxy.ts` — autentica JWT para `/api/admin/*`
- Inyecta en las rutas protegidas:
  - `x-empresa-id` — ID del tenant (leer via `requireAuth`)
  - `x-admin-id` — ID del admin logueado
  - `x-admin-rol` — Rol del admin
- Rutas públicas que NO requieren JWT:
  - `/api/admin/login`
  - `/api/admin/logout`
  - `/api/unsubscribe`
  - `/api/admin/promociones/unsubscribe`

> ⚠️ **IMPORTANTE**: Si agregás nuevas rutas públicas en el admin, agregarlas al proxy en `isPublicRoute`

### Imágenes
- Se optimizan en cliente antes del upload (480x480, WebP, 80%) en `components/ui/image-uploader.tsx`
- **Flujo de upload (servidor)**: browser → `POST /api/admin/upload-image` → Cloudflare API / R2
  1. Cliente selecciona imagen y la optimiza a WebP (canvas)
  2. POST a `/api/admin/upload-image` con `FormData`
  3. El API route deriva `empresaSlug` desde la DB (usando `empresaId` del JWT) — nunca del cliente
  4. Si `CLOUDFLARE_API_TOKEN` está definido: upload via `api.cloudflare.com` REST API (recomendado en dev, bypassa `r2.cloudflarestorage.com`)
  5. Si no: fallback con AWS SDK `PutObjectCommand` (S3-compatible)
  6. Devuelve `{ publicUrl }` y el componente llama `onChange(publicUrl)`
- **Todos los uploads** (productos, configuración, promociones) pasan por `/api/admin/upload-image`
- **NO** usar presigned URLs ni `uploadImageAction` — eliminados
- `core/infrastructure/storage/actions.ts` y `core/application/actions/storage.actions.ts` fueron eliminados

### R2
- Cliente singleton en `core/infrastructure/storage/s3-client.ts`
  - `getS3Client()` — Obtener cliente S3 (lanza si falta config)
  - `getR2Config()` — Obtener `{ bucketName, publicDomain }`
  - `deleteImageFromR2(url)` — Eliminar imagen del bucket por URL pública
- **Dominio público**: `NEXT_PUBLIC_R2_DOMAIN=https://imagenes.almadearena.es` (subdominio custom mapeado al bucket)
- **Estructura de URLs**: `https://imagenes.almadearena.es/{empresa.dominio}/{año}/{mes}/{uuid}-{filename}.webp`
  - Ej. prod: `https://imagenes.almadearena.es/almadearena.es/2025/01/abc123-banner.webp`
  - Ej. dev:  `https://imagenes.almadearena.es/localhost/2025/01/abc123-banner.webp`
- **`empresaSlug`** en el path se deriva de `empresa.slug` (columna `slug` en `empresas`), con fallback a `empresa.dominio`. Nunca viene del cliente.
- **Fix SSL en desarrollo**: antivirus intercepta HTTPS de Node.js → `rejectUnauthorized: false` vía `@smithy/node-http-handler` (solo en `NODE_ENV !== "production"`)
- **Fix checksums R2**: AWS SDK v3 añade CRC32 por defecto; R2 no los soporta → `requestChecksumCalculation: "WHEN_REQUIRED"` y `responseChecksumValidation: "WHEN_REQUIRED"` en el S3Client
- **R2 CORS**: solo necesario para uploads directos desde el browser (no aplica al flujo actual server-side)

### Rate Limiting (Upstash Redis)
- **Archivo**: `core/infrastructure/api/rate-limit.ts`
- **Login**: 5 intentos / 15 min por IP (`rateLimitLogin`)
- **Rutas públicas**: 20 requests / min por IP (`rateLimitPublic`)
- **Env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Graceful degradation**: Si no hay Redis configurado, no limita (desarrollo local sin Redis funciona)
- **Rutas protegidas**: `/api/admin/login`, `/api/pedidos`, `/api/unsubscribe`, `/api/admin/promociones/unsubscribe`

### Validation
- **TODAS** las rutas API usan Zod schemas con `safeParse`
- Usar los DTOs en `core/application/dtos/`
- Colores hex: `z.string().regex(/^#[0-9A-Fa-f]{6}$/)`

### Subdominios y Multi-tenant

| Dominio | Comportamiento |
|---------|----------------|
| `midominio.com` | Menú sin carrito |
| `pedidos.midominio.com` | Menú + carrito |
| `midominio-pedidos.com` | Menú + carrito (alternativa) |

- La empresa se resuelve siempre por el `dominio` principal (sin subdominio)
- El carrito se activa si el host actual coincide con `subdomain_pedidos` de la empresa
- Usar `parseMainDomain(domain)` de `lib/domain-utils.ts` para extraer el dominio principal

### Build
- "Skipping validation of types" es normal en Next.js 16

### Promociones
- `/api/admin/promociones` — GET lista, POST crea y envía emails (usa `requireAuth`)
- `/api/admin/promociones/unsubscribe` — Ruta pública (sin JWT)
- Imagen se sube a R2 en carpeta `{empresaSlug}/promo-*.webp`
- Al crear nueva promo, se borra imagen anterior de R2 con `deleteImageFromR2`
- `texto_promocion` se escapa con `escapeHtml()` antes de insertar en el email HTML

### Pedidos (flujo público)
- `POST /api/pedidos` — Ruta pública, crea el pedido y registra/actualiza el cliente
- `POST /api/admin/pedidos/enviar-email` — Protegida por proxy JWT, envía email de confirmación al admin
- El flujo busca la empresa por `empresaId` extraído del JWT (via `requireAuth`), no por dominio

### Configuración Empresa
- `/admin/configuracion` — Datos de contacto (fb, instagram, url_mapa, direccion, telefono_whatsapp, email_notification)
- API: `/api/admin/empresa` — GET/PUT
- API: `/api/admin/update-colores` — POST (colores hex, usa `requireAuth` + `empresaUseCase.updateColores`)


## Comandos
```bash
pnpm dev    # Desarrollo
pnpm build  # Build
pnpm lint   # Lint

# Scripts útiles
npx tsx scripts/setup-r2-cors.ts  # Configurar CORS en R2
```
