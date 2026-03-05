# AGENTS.md - Contexto para Agentes IA

## Stack
Next.js 16 + React 19 + TypeScript + Supabase + Tailwind CSS v4 + Cloudflare R2

**Nota:** Next.js 16 usa Turbopack por defecto en desarrollo.

## Arquitectura - Clean Architecture 100%

```
API Routes → Use Cases → Repositories → Supabase/R2
```

### Capas (obligatorias)

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| **Domain** | `core/domain/` | Entidades, interfaces de repositorios |
| **Application** | `core/application/` | DTOs (Zod), Use Cases |
| **Infrastructure** | `core/infrastructure/` | Implementaciones de repositories |

### Flujo obligatorio

```typescript
// 1. API Route valida con Zod y llama Use Case
import { productUseCase } from '@/core/infrastructure/database';
import { createProductSchema } from '@/core/application/dtos/product.dto';
import { requireAuth, successResponse, errorResponse } from '@/core/infrastructure/api/helpers';

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = createProductSchema.safeParse({ ...body, empresaId });
  if (!parsed.success) return errorResponse(parsed.error.errors[0].message, 400);

  const product = await productUseCase.create(parsed.data);
  return successResponse(product, 201);
}

// 2. Use Case contiene lógica de negocio
// 3. Repository abstrae la base de datos
```

## Principios a Seguir (OBLIGATORIOS)

### Clean Architecture
- **NUNCA** acceder a la DB directamente desde API routes
- **SIEMPRE** pasar por: Use Case → Repository → Supabase
- Usar el cliente singleton: `getSupabaseClient()`

### SOLID - Dependency Inversion
- Depender de **interfaces** (abstracciones), no de implementaciones
- **BIEN**: `constructor(private readonly repo: IProductRepository)`
- **MAL**: `const supabase = createClient(url, key)`

### OWASP
- JWT con cookies **HttpOnly**
- Zod validation en **TODAS** las API routes
- Sanitización de inputs
- No hardcodear secrets

## Estructura clave

```
src/
├── app/api/admin/              # Rutas API con Zod validation
├── core/
│   ├── domain/
│   │   ├── entities/types.ts   # Tipos: Product, Category, Empresa, etc.
│   │   └── repositories/       # Interfaces: IProductRepository, ICategoryRepository, etc.
│   ├── application/
│   │   ├── dtos/               # Zod schemas: product.dto.ts, category.dto.ts, etc.
│   │   └── use-cases/          # Lógica de negocio: ProductUseCase, CategoryUseCase, etc.
│   └── infrastructure/
│       ├── api/helpers.ts       # requireAuth, successResponse, errorResponse
│       ├── database/            # Supabase repositorios implementación
│       │   ├── supabase-client.ts  # Singleton - NO crear nuevos clientes
│       │   └── index.ts            # Exports de use cases y repositories
│       └── storage/s3-client.ts # Singleton R2
├── components/ui/              # ImageUploader (optimiza imágenes)
└── lib/                        # AdminContext, CartContext
```

## Helpers de API (OBLIGATORIOS USAR)

```typescript
// core/infrastructure/api/helpers.ts

// Autenticación - usar en todas las rutas protegidas
const { empresaId, error } = await requireAuth(request);
if (error) return error;

// Respuestas consistentes
return successResponse(data);           // 200 OK
return successResponse(data, 201);      // 201 Created
return errorResponse('msg');           // 500 Error
return errorResponse('msg', 404);      // 404 Not Found
return validationErrorResponse('msg'); // 400 Bad Request
```

## Repositorios y Use Cases Disponibles

```typescript
// Importar desde core/infrastructure/database
import { 
  productUseCase,      // ProductUseCase
  categoryUseCase,    // CategoryUseCase
  clienteUseCase,     // ClienteUseCase
  empresaRepository,  // IEmpresaRepository
  promocionRepository, // IPromocionRepository
  pedidoRepository,   // IPedidoRepository
  adminRepository,   // IAdminRepository
} from '@/core/infrastructure/database';
```

## Supabase - Estructura de Tablas

| Tabla | PK | FK | Notas |
|-------|----|----|-------|
| `empresas` | id (uuid) | - | dominio, subdomain_pedidos, colores, logo_url, fb, instagram, url_mapa, direccion, telefono_whatsapp |
| `perfiles_admin` | id (uuid) | empresa_id → empresas | → auth.users |
| `categorias` | id (uuid) | empresa_id → empresas | categoria_padre_id, categoriaComplementoDe |
| `productos` | id (uuid) | empresa_id, categoria_id → categorias | i18n: titulo_es/en/fr/it/de |
| `clientes` | id (uuid) | empresa_id | telefono único |
| `pedidos` | id (uuid) | empresa_id, cliente_id → clientes | detalle_pedido (JSON) |
| `promociones` | id (uuid) | empresa_id → empresas | imagen_url, numero_envios |

**Nota:** Tabla `pedidos` NO tiene columna `telefono` - el teléfono está en `clientes`.

## Errores Comunes a Evitar

1. **NO usar `createClient` en API routes** - Usar `getSupabaseClient()` singleton
2. **NO acceder a DB directamente** - Usar siempre Use Cases
3. **NO usar `telefono` en pedidos** - La columna no existe
4. **Subdominios** - Buscar por `dominio` principal
5. **Imágenes R2** - Usar cliente singleton, no crear nuevos clientes

## Buenas Prácticas (OBLIGATORIAS)

- ✅ Usar `getSupabaseClient()` singleton
- ✅ Zod validation en **TODAS** las API routes
- ✅ Usar helpers: `requireAuth`, `successResponse`, `errorResponse`
- ✅ Labels con `htmlFor` para accessibility
- ✅ Props `readonly` en interfaces
- ✅ `<Image>` de Next.js para imágenes
- ✅ `<Link>` de Next.js para navegación


## Cosas importantes para el agente

### Footer
- Fondo negro, muestra logo, descripción, fb, instagram, dirección, WhatsApp, email y mapa (iframe)

### Middleware
- `src/proxy.ts` - autentica JWT para `/api/admin/*`

### Imágenes
- Se optimizan en cliente (480x480, WebP, 80%)

### R2
- Cliente singleton en `core/infrastructure/storage/s3-client.ts`
  - `getS3Client()` - Obtener cliente
  - `getR2Config()` - Obtener config (bucket, domain)
  - `deleteImageFromR2(url)` - Eliminar imagen del bucket
- **R2 CORS**: Necesita configurarse para uploads directos (ejecutar `scripts/setup-r2-cors.ts`)

### Supabase
- Cliente singleton en `core/infrastructure/database/supabase-client.ts`
- **NUNCA** crear nuevos clientes con `createClient` en las rutas

### Validation
- **TODAS** las rutas API usan Zod schemas
- Usar los DTOs en `core/application/dtos/`

### Subdominios
- `pedidos.dominio.com` activa el carrito

### Build
- "Skipping validation of types" es normal en Next.js 16

### Promociones
- `/api/admin/promociones` - GET lista, POST crea y envía emails
- `/api/admin/promociones/unsubscribe` - Ruta pública para darse de baja (sin JWT)
- Imagen se sube a R2 en carpeta `{empresaSlug}/promo-*.webp`
- Al crear nueva promo, se borra imagen anterior de R2
- Email incluye logo de empresa (de empresas.logo_url) + imagen promo, y los enlaces de suscripción/baja usan el `dominio` de la empresa para generar las URLs.

### Configuración Empresa
- `/admin/configuracion` - Datos de contacto (fb, instagram, url_mapa, direccion, telefono_whatsapp, email_notification)
- API: `/api/admin/empresa` - GET/PUT con los campos nuevos

## Comandos
```bash
pnpm dev    # Desarrollo
pnpm build  # Build
pnpm lint   # Lint

# Scripts útiles
npx tsx scripts/setup-r2-cors.ts  # Configurar CORS en R2
```
