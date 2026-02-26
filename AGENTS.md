# AGENTS.md - Documentación para Agentes IA

## Overview del Proyecto

**Nombre:** Mermelada de Tomate  
**Stack:** Next.js 16 + React 19 + TypeScript + Supabase + Tailwind CSS v4 + Cloudflare R2
**Tipo:** E-commerce / Carta digital multi-idioma con gestión de pedidos  
**Arquitectura:** Clean Architecture con principios SOLID

---

## Estructura de Directorios

```
src/
├── app/                      # Next.js App Router (Pages & Layouts)
│   ├── actions.ts           # Server Actions (seguridad JWT)
│   ├── layout.tsx          # Root layout con providers
│   └── page.tsx            # Página principal
│   └── admin/              # Panel de administración
│       ├── (protected)/     # Rutas protegidas
│       │   ├── layout.tsx  # Layout con AdminProvider
│       │   ├── page.tsx    # Dashboard
│       │   ├── categorias/
│       │   └── productos/
│       └── login/
│
├── core/                    # CLEAN ARCHITECTURE
│   ├── domain/             # Entidades e Interfaces (DDD)
│   │   ├── entities/       # Types: Product, Category, Tenant
│   │   └── repositories/   # Interfaces: IProductRepository, ICategoryRepository, IStorageRepository
│   │
│   ├── application/        # Casos de Uso (Use Cases) + Actions
│   │   ├── dtos/          # Data Transfer Objects + Zod schemas
│   │   ├── use-cases/     # GetMenuUseCase, CreateProductUseCase
│   │   └── actions/       # Server Actions (storage.actions.ts)
│   │
│   └── infrastructure/    # Implementaciones concretas
│       ├── database/       # SupabaseProductRepository, SupabaseCategoryRepository
│       └── storage/        # R2StorageRepository, actions.ts
│
├── components/              # Componentes React
│   └── ui/                 # Componentes UI (ImageUploader, etc.)
│
├── lib/                    # Utilidades y contexto
│   ├── admin-context.tsx   # Context para datos del admin (empresaId, empresaSlug)
│   └── ...
│
scripts/
├── generate-token.ts       # Script para generar JWT de acceso
└── setup-r2-cors.ts       # Script para configurar CORS en R2
```

---

## Panel de Administración (/admin)

### Características
- **Diseño Responsive:** Sidebar con hamburger menu en móvil
- **Buscador:** Filtra productos/categorías en todos los idiomas
- **Ordenamiento:** Click en columnas para ordenar
- **Vista móvil:** Cards en lugar de tablas

### Estructura de Rutas
```
src/app/
├── admin/
│   ├── (protected)/
│   │   ├── layout.tsx      # Layout con sidebar + AdminProvider
│   │   ├── page.tsx        # Dashboard
│   │   ├── categorias/      # CRUD categorías
│   │   └── productos/      # CRUD productos + upload imágenes
│   └── login/
│       └── page.tsx
```

### AdminProvider
Provee datos de la empresa logueada:
```typescript
interface AdminContextType {
  empresaId: string;
  empresaSlug: string;  // Para organizar archivos en R2
}
```

---

## Upload de Imágenes (Cloudflare R2)

### Flujo
1. **ImageUploader** (componente UI) → Server Action
2. **storage.actions.ts** → Genera URL firmada
3. **Upload directo** desde el navegador a R2
4. **URL pública** guardada en la BBDD

### Estructura de Archivos en R2
```
{_bucket}/
└── {empresa_slug}/
    └── {año}/
        └── {mes}/
            └── {uuid}-{filename}.{ext}
```

Ejemplo: `images/mermelada-de-tomate/2026/2/abc123-ensalada.webp`

### Variables de Entorno (R2)
```env
R2_ACCOUNT_ID=tu_account_id
R2_ACCESS_KEY_ID=tu_access_key
R2_SECRET_ACCESS_KEY=tu_secret_key
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://tu-dominio.r2.dev
```

### Configuración CORS
El bucket necesita CORS configurado. Ejecutar:
```bash
npx tsx scripts/setup-r2-cors.ts
```

---

## Base de Datos (Supabase / PostgreSQL)

### Tablas Principales

| Tabla | Descripción | Clave Foránea |
|-------|-------------|---------------|
| `empresas` | Multi-tenant: empresas/clientes | PK: `id` (uuid) |
| `categorias` | Categorías del menú | FK: `empresa_id` |
| `productos` | Productos con i18n | FK: `empresa_id`, `categoria_id` |
| `clientes` | Clientes registrados | FK: `empresa_id` |
| `pedidos` | Pedidos realizados | FK: `empresa_id` |
| `perfiles_admin` | Admin users | FK: `id` → auth.users, `empresa_id` |

---

## Principios SOLID Aplicados

### Dependency Inversion (DIP) - Ejemplo Storage
```typescript
// Componente UI NO usa implementación directa
import { uploadImageAction } from '@/core/application/actions/storage.actions';

// Server Action delega a infraestructura
import { getPresignedUploadUrlAction } from '@/core/infrastructure/storage/actions';

// Infraestructura implementa la interfaz
import { R2StorageRepository } from '@/core/infrastructure/storage/R2StorageRepository';
```

Flujo: **UI → Server Action → Interface → Implementación**

---

## Seguridad OWASP

### 1. A01: Broken Access Control
- Cookies `HttpOnly` para token admin
- Verificación JWT en Server Actions

### 2. A02: Cryptographic Failures
- JWT con `jose`
- Secrets en variables de entorno

### 3. A03: Injection
- Zod validation en DTOs
- Parámetros parametrizados

### 4. A04: Insecure Design
- Clean Architecture
- Validación en múltiples capas

### 5. A05: Security Misconfiguration
- Solo variables `NEXT_PUBLIC_*` en cliente
- Código server-only marcado

---

## Comandos Útiles

```bash
# Desarrollo
pnpm dev

# Build producción
pnpm build

# Lint
pnpm lint

# Generar token acceso
npx tsx scripts/generate-token.ts

# Configurar CORS en R2
npx tsx scripts/setup-r2-cors.ts
```

---

## Tecnologías Principales

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 | Framework full-stack |
| React | 19.2.0 | UI Library |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | BBDD + Auth |
| Cloudflare R2 | - | Storage imágenes |
| Tailwind CSS | 4.1.9 | Estilos |
| AWS SDK | ^3.994 | S3/R2 |
| Zod | 3.25.76 | Validación schemas |
| jose | 6.1.3 | JWT |

---

## Notas Importantes

- **Multi-tenant:** Sistema para múltiples empresas, cada una con su propio directorio en R2
- **i18n:** Soporte para ES, EN, FR, IT, DE
- **SSR:** Renderizado server-side para SEO
- **Clean Architecture:** UI → Server Actions → Use Cases → Repositories → Infrastructure
- **Admin responsive:** Vista adaptativa para móvil y desktop
