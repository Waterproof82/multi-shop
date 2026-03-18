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
| Brevo | — | Envío de emails |

---

## Arquitectura — Clean Architecture 100%

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
│   ├── layout.tsx                   # Root layout (multi-tenant por dominio)
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
│       ├── admin/                   # Protegidas por proxy JWT
│       │   ├── login/               # POST — autenticación
│       │   ├── logout/              # POST — cerrar sesión
│       │   ├── productos/           # CRUD productos
│       │   ├── categorias/          # CRUD categorías
│       │   ├── pedidos/             # GET/PATCH/DELETE + PUT (stats)
│       │   │   └── enviar-email/    # POST — email de confirmación al admin
│       │   ├── upload-image/        # POST — upload de imágenes a R2
│       │   ├── clientes/            # CRUD clientes
│       │   ├── empresa/             # GET/PUT datos empresa
│       │   ├── update-colores/      # POST colores del tema
│       │   └── promociones/
│       │       └── unsubscribe/     # GET — pública, toggle suscripción
│       ├── pedidos/                 # POST — pública, crear pedido
│       └── unsubscribe/             # GET — pública, dar de baja/alta promo
│
├── core/                            # Clean Architecture
│   ├── domain/
│   │   ├── entities/types.ts        # Tipos: Product, Category, Empresa,
│   │   │                            #   EmpresaColores, Cliente, Pedido,
│   │   │                            #   PedidoItem, PedidoComplemento,
│   │   │                            #   CartItem, Promocion, Tenant
│   │   └── repositories/            # Interfaces: IProductRepository,
│   │                                #   ICategoryRepository, IAdminRepository,
│   │                                #   IClienteRepository, IEmpresaRepository,
│   │                                #   IPedidoRepository, IPromocionRepository
│   ├── application/
│   │   ├── dtos/                    # Schemas Zod: product.dto.ts,
│   │   │                            #   category.dto.ts, cliente.dto.ts,
│   │   │                            #   empresa.dto.ts, auth.dto.ts
│   │   └── use-cases/               # product, category, cliente, empresa,
│   │                                #   pedido, promocion, auth-admin, get-menu
│   └── infrastructure/
│       ├── api/helpers.ts           # requireAuth, successResponse,
│       │                            #   errorResponse, validationErrorResponse,
│       │                            #   handleResult
│       ├── database/
│       │   ├── supabase-client.ts   # DOS singletons (service role + anon)
│       │   ├── index.ts           # Inyección de dependencias — exporta
│       │   │                        #   todos los use cases y repositories
│       │   ├── SupabaseProductRepository.ts
│       │   ├── SupabaseCategoryRepository.ts
│       │   ├── SupabaseAdminRepository.ts
│       │   ├── SupabaseClienteEmpresaRepository.ts
│       │   ├── SupabasePromocionPedidoRepository.ts
│       │   └── SupabaseLogErrorRepository.ts
│       ├── logging/
│       │   └── logger.ts           # ErrorLogger singleton para logging
│       └── storage/
│           ├── s3-client.ts         # Singleton R2: getS3Client(),
│           │                        #   getR2Config(), deleteImageFromR2()
│           │                        #   uploadToR2() (via Cloudflare API o AWS SDK)
│
├── components/                      # Componentes React
│   └── ui/                          # ImageUploader, Button, Dialog, etc.
│
├── proxy.ts                         # Middleware JWT para /api/admin/*
│
└── lib/
    ├── domain-utils.ts              # parseMainDomain(), getDomainFromHeaders()
    ├── html-utils.ts                # escapeHtml()
    ├── server-services.ts           # getEmpresaByDomain(), getMenuUseCase
    ├── admin-context.tsx            # AdminContext (empresaId, empresaNombre)
    ├── cart-context.tsx             # CartContext
    └── translations.ts             # Traducciones i18n
```

---

## Principios Aplicados

### ✅ Clean Architecture (100%)

| Capa | Contenido |
|------|-----------|
| **Domain** | `entities/types.ts`, `repositories/I*.ts` |
| **Application** | `dtos/*.ts`, `use-cases/*.ts` |
| **Infrastructure** | `database/*.ts`, `storage/*.ts`, `api/helpers.ts` |

Reglas estrictas:
- **NUNCA** acceder a DB directamente desde routes o pages
- **SIEMPRE** pasar por: Use Case → Repository → Supabase
- **NUNCA** llamar `createClient()` fuera de `supabase-client.ts`

### ✅ SOLID (100%)

- **Dependency Inversion**: repositorios inyectados por constructor, instanciados en `index.ts`
- Sin `any` — se usan tipos de dominio (`Product`, `Category`, `PedidoItem`, etc.) o `Record<string, unknown>`

```typescript
// ✅ BIEN — depende de abstracción
export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}
}

// ❌ MAL — depende de implementación
const supabase = createClient(url, key); // fuera de supabase-client.ts
```

### ✅ OWASP (100%)

| Principio | Implementación |
|-----------|----------------|
| **JWT** | HS256 con `jose` | HttpOnly cookie, 24h expiry |
| **Autorización** | Proxy middleware valida JWT, inyecta `x-empresa-id` |
| **Validación de entrada** | Zod `safeParse` en **todas** las API routes |
| **Sanitización HTML** | `escapeHtml()` en todos los templates de email |
| **Validación colores** | Regex `#RRGGBB` en Zod antes de persistir |
| **Sin secretos hardcodeados** | Todas las claves en variables de entorno |
| **`NEXT_PUBLIC_BASE_URL`** | Obligatorio en producción — sin fallbacks inseguros |

---

## Helpers de API

```typescript
// core/infrastructure/api/helpers.ts

// Autenticación — usar en TODAS las rutas protegidas /api/admin/*
const { empresaId, error: authError } = await requireAuth(request);
if (authError) return authError;

// Respuestas consistentes
return successResponse(data);            // 200 OK
return successResponse(data, 201);       // 201 Created
return errorResponse('msg');             // 500 Error
return errorResponse('msg', 404);        // 404 Not Found
return validationErrorResponse('msg');   // 400 Bad Request
```

## Helper de dominio

```typescript
// lib/domain-utils.ts — importar SIEMPRE desde aquí, no duplicar

import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';

const domain = await getDomainFromHeaders(); // extrae host del request
const main = parseMainDomain(domain);        // elimina subdominio pedidos
```

---

## Repositorios y Use Cases

```typescript
// Importar desde core/infrastructure/database
import {
  productUseCase,     // ProductUseCase
  categoryUseCase,    // CategoryUseCase
  clienteUseCase,     // ClienteUseCase
  empresaUseCase,     // EmpresaUseCase
  pedidoUseCase,      // PedidoUseCase
  promocionUseCase,   // PromocionUseCase
  authAdminUseCase,   // AuthAdminUseCase
  empresaRepository,  // IEmpresaRepository (rutas públicas: findByDomain)
} from '@/core/infrastructure/database';
```

### Use Cases — métodos

| Use Case | Métodos |
|----------|---------|
| **ProductUseCase** | `getAll`, `create`, `update`, `delete` |
| **CategoryUseCase** | `getAll`, `create`, `update`, `delete` |
| **ClienteUseCase** | `getAll`, `create`, `update`, `delete`, `togglePromoSubscription` |
| **EmpresaUseCase** | `getById`, `update`, `updateColores` |
| **PedidoUseCase** | `getAll`, `create`, `updateStatus`, `getStats`, `delete` |
| **PromocionUseCase** | `getAll`, `create` |
| **AuthAdminUseCase** | `login`, `verifyToken` |

### Repositories — métodos

| Repository | Métodos |
|------------|---------|
| **IAdminRepository** | `loginWithPassword`, `findById` |
| **IClienteRepository** | `findAllByTenant`, `findByEmail`, `findByTelefono`, `create`, `update`, `delete` |
| **IEmpresaRepository** | `getById`, `findByDomain`, `update`, `updateColores` |
| **IPedidoRepository** | `findAllByTenant`, `updateStatus`, `delete`, `create`, `getStats` |
| **IPromocionRepository** | `findAllByTenant`, `create`, `deleteAllByTenant` |
| **IProductRepository** | `findAllByTenant`, `create`, `update`, `delete` |
| **ICategoryRepository** | `findAllByTenant`, `create`, `update`, `delete` |
| **ILogErrorRepository** | `log` |

---

## Tipos de Dominio

```typescript
// core/domain/entities/types.ts

interface Empresa {
  id, nombre, dominio, logoUrl, mostrarCarrito, moneda,
  emailNotification, urlImage, colores: EmpresaColores | null,
  descripcion, fb?, instagram?, urlMapa?, direccion?, telefonoWhatsapp?
}

interface PedidoComplemento {
  nombre?: string; name?: string;   // ambos formatos por compatibilidad histórica
  precio?: number; price?: number;
}

interface PedidoItem {
  producto_id?, nombre, precio, cantidad,
  complementos?: PedidoComplemento[]   // objetos, NO strings
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

### Flujo de login
```
POST /api/admin/login
  → AuthAdminUseCase.login()
  → adminRepo.loginWithPassword()  (Supabase Auth)
  → adminRepo.findById()           (perfil + empresa)
  → JWT HS256, 24h
  → cookie admin_token (HttpOnly, SameSite=lax)
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
- Verifica JWT en todas las rutas `/api/admin/*`
- Inyecta `x-empresa-id`, `x-admin-id`, `x-admin-rol` como headers
- Rutas públicas sin JWT: `/api/admin/login`, `/api/admin/logout`, `/api/unsubscribe`, `/api/admin/promociones/unsubscribe`

> ⚠️ Agregar nuevas rutas públicas a `isPublicRoute` en `proxy.ts`

---

## Subdominios y Multi-tenant

| Host | Comportamiento |
|------|---------------|
| `midominio.com` | Menú sin carrito |
| `pedidos.midominio.com` | Menú + carrito |
| `midominio-pedidos.com` | Menú + carrito (dominio propio) |

La empresa se resuelve por dominio principal. `parseMainDomain()` de `lib/domain-utils.ts` extrae el dominio sin subdominio.

---

## Imágenes (Cloudflare R2)

### Estructura de carpetas en bucket

```
{empresa-slug}/{año}/{mes}/{uuid}-{filename}.webp
```

### Flujo de upload
1. Cliente selecciona imagen
2. Optimización en browser (480×480, WebP, 80%) en `components/ui/image-uploader.tsx`
3. POST a `/api/admin/upload-image` con `FormData`
4. El API route deriva `empresaSlug` desde la DB — nunca del cliente
5. Upload a R2 via Cloudflare API (si `CLOUDFLARE_API_TOKEN` configurado) o AWS SDK fallback
6. Devuelve `{ publicUrl }`

### Funciones disponibles
```typescript
import { getS3Client, getR2Config, deleteImageFromR2, uploadToR2 } from '@/core/infrastructure/storage/s3-client';

deleteImageFromR2(publicUrl); // elimina imagen por URL pública
await uploadToR2(key, buffer, contentType); // upload directo (usado por /api/admin/upload-image)
```

### Configurar CORS (solo una vez)
```bash
npx tsx scripts/setup-r2-cors.ts
```

---

## Base de Datos (Supabase)

| Tabla | PK | FK | Notas |
|-------|----|----|-------|
| `empresas` | id (uuid) | — | dominio, subdomain_pedidos, colores, fb, instagram, url_mapa, telefono_whatsapp |
| `perfiles_admin` | id (uuid) | empresa_id → empresas | → auth.users |
| `categorias` | id (uuid) | empresa_id → empresas | categoria_padre_id, categoriaComplementoDe |
| `productos` | id (uuid) | empresa_id, categoria_id | i18n: titulo_es/en/fr/it/de |
| `clientes` | id (uuid) | empresa_id | telefono único por empresa |
| `pedidos` | id (uuid) | empresa_id, cliente_id | detalle_pedido: JSON (PedidoItem[]) |
| `promociones` | id (uuid) | empresa_id | imagen_url, numero_envios |

> ⚠️ `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`

> ⚠️ `detalle_pedido[].complementos` almacena objetos `{ name, price }` — tipo `PedidoComplemento[]`

---

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Auth JWT
ACCESS_TOKEN_SECRET=secreto_largo_y_aleatorio

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_PUBLIC_DOMAIN=https://xxx.r2.dev

# Email (Brevo)
BREVO_API_KEY=xxx

# App (obligatorio en producción)
NEXT_PUBLIC_BASE_URL=https://tudominio.com
```

---

## Comandos

```bash
pnpm dev      # Desarrollo con Turbopack
pnpm build    # Build de producción
pnpm lint     # Linting

# Scripts
npx tsx scripts/setup-r2-cors.ts     # Configurar CORS en R2
```

---

## Estado del Proyecto

| Aspecto | Estado |
|---------|--------|
| **Build** | ✅ Compila correctamente |
| **Clean Architecture** | ✅ 100% — Domain / Application / Infrastructure |
| **SOLID** | ✅ 100% — DIP, sin `any`, repositorios inyectados |
| **OWASP** | ✅ 100% — JWT HttpOnly, Zod safeParse, escapeHtml, hex validation |
| **Tipos TypeScript** | ✅ Sin `any` en core ni API routes |
| **Código duplicado** | ✅ `parseMainDomain`/`getDomainFromHeaders` centralizados en `lib/domain-utils.ts` |
| **Error Handling (Result\<T\>)** | ✅ 100% — Todos los módulos migrados al patrón Result<T, E> |
| **Logging Centralizado** | ✅ 100% — Tabla log_errors + ErrorLogger singleton |
| **UI/UX Quality** | ✅ 100% — Distill, Polish, Optimize aplicados |

---

## UI/UX Quality — Mejoras Implementadas

### 🎨 Design System

| Componente | Características |
|------------|----------------|
| **Button** | Focus-visible con outline + ring offset, transiciones suaves, active:scale |
| **Input** | Focus-visible con ring, transiciones optimizadas |
| **Badge** | Animación badge-pop con soporte reduced-motion |
| **Tema** | Variables CSS para todos los colores, soporte dark mode |

### ✨ Polish — Detalles Finales

- **Focus states**: Todos los elementos interactivos tienen `focus-visible` con outline y ring offset
- **Hover states**: Transiciones suaves de 150ms con `ease-out`
- **Active states**: Efecto `scale-95` o `scale-[0.98]` para feedback táctil
- **Empty states**: Mejorados con iconografía y mensajes helpful
- **Micro-interactions**: Animaciones sutiles en botones, cards, y elementos del carrito
- **Transiciones**: Consistencia en duration (150-300ms) y easing (ease-out)

### 🚀 Optimize — Rendimiento

- **Content Visibility**: Secciones del menú usan `contentVisibility: auto` para evitar renderizado innecesario
- **Reduced Motion**: Animaciones de Framer Motion respetan `prefers-reduced-motion`
- **Lazy Loading**: Imágenes con `loading="lazy"` (por defecto en Next.js)
- **Optimización de fuentes**: `display: swap` en Playfair Display e Inter
- **Animaciones GPU**: Solo `transform` y `opacity` — ninguna propiedad que cause layout/paint

### 🔧 Distill — Simplificación

- **SVGs optimizados**: Iconos de redes sociales en footer usan componentes lucide-react
- **DRY**: Componente `TranslationFields` extraído para evitar duplicación en formularios de productos
- **CSS cleanup**: Eliminados estilos redundantes, uso consistente de tokens

### ♿ Accesibilidad

- **Keyboard navigation**: Todos los elementos clickables tienen `tabIndex` y handlers de `onKeyDown`
- **ARIA labels**: Botones con labels descriptivos para screen readers
- **Reduced motion**: Respeto total por `prefers-reduced-motion`
- **Contrast ratios**: Colores verificados contra WCAG AA

### Ejemplo de Component con todas las calidades

```tsx
// Button con polish + optimize
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]',
        // ...
      },
    },
  }
);

// Framer Motion con reduced motion
const shouldReduceMotion = useReducedMotion() ?? false;
const variants = shouldReduceMotion
  ? { initial: {}, animate: {} }
  : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };
```

### Deuda Técnica

- Ninguna. El proyecto está completo y estable.
- Sistema de error handling 100% implementado con Result<T, E> pattern

---

## Deployment (Vercel)

1. Conectar repo a Vercel
2. Configurar variables de entorno
3. Framework Preset: Next.js
4. Deploy automático en push a main

**Notas:**
- Next.js 16 usa Turbopack por defecto — normal ver "Skipping validation of types"
- R2 necesita CORS configurado para uploads directos desde el browser
- `NEXT_PUBLIC_BASE_URL` es obligatorio — usado en links de emails de promociones
