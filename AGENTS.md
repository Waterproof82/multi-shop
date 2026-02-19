# AGENTS.md - Documentación para Agentes IA

## Overview del Proyecto

**Nombre:** Mermelada de Tomate  
**Stack:** Next.js 16 + React 19 + TypeScript + Supabase + Tailwind CSS v4  
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
│
├── core/                    # CLEAN ARCHITECTURE
│   ├── domain/             # Entidades e Interfaces (DDD)
│   │   ├── entities/       # Types: Product, Category, Tenant
│   │   └── repositories/  # Interfaces: IProductRepository, ICategoryRepository, IStorageRepository
│   │
│   ├── application/        # Casos de Uso (Use Cases)
│   │   ├── dtos/          # Data Transfer Objects + Zod schemas
│   │   └── use-cases/     # GetMenuUseCase, CreateProductUseCase
│   │
│   └── infrastructure/     # Implementaciones concretas
│       ├── database/       # SupabaseProductRepository, SupabaseCategoryRepository
│       └── storage/        # R2StorageRepository
│
├── components/              # Componentes React
│   ├── ui/                 # Componentes Radix UI (botones, dialogs, etc.)
│   ├── cart-drawer.tsx     # Carrito de compras
│   ├── menu-section.tsx    # Sección del menú
│   ├── category-nav.tsx    # Navegación por categorías
│   ├── hero-banner.tsx     # Banner principal
│   ├── site-header*.tsx    # Header con variantes client/server
│   ├── language-selector.tsx
│   └── theme-provider.tsx
│
├── lib/                    # Utilidades y contexto
│   ├── supabaseClient.ts   # Cliente Supabase ( público )
│   ├── server-services.ts  # Servicios server-only
│   ├── cart-context.tsx    # Context API para carrito
│   ├── language-context.tsx # Context para i18n
│   ├── translations.ts     # Traducciones estáticas
│   └── utils.ts            # Utilidades (cn, etc.)
│
├── hooks/                  # Custom hooks
│   └── use-toast.ts        # Hook para notificaciones
│
├── styles/                # Estilos globales
│   └── globals.css        # Tailwind v4 + variables CSS + tema italiano
│
└── proxy.ts               # Proxy para APIs (si aplica)

scripts/
└── generate-token.ts      # Script para generar JWT de acceso

context/
└── bbdd.md               # Esquema de base de datos (Supabase/PostgreSQL)
```

---

## Panel de Administración (/admin)

### Estructura de Rutas
```
src/app/
├── admin/
│   ├── layout.tsx           # Layout con sidebar y protección de rutas
│   ├── page.tsx             # Dashboard principal
│   ├── login/
│   │   └── page.tsx         # Página de login
│   ├── categorias/
│   │   └── page.tsx         # CRUD de categorías
│   └── productos/
│       └── page.tsx         # CRUD de productos
│
└── api/admin/
    ├── login/route.ts        # Endpoint login
    ├── logout/route.ts      # Endpoint logout
    ├── categorias/route.ts   # CRUD categorías
    └── productos/route.ts    # CRUD productos
```

### Autenticación Admin
- **Proveedor:** Supabase Auth (Authentication/Users)
- **Vinculación:** Tabla `perfiles_admin` con FK a `auth.users`
- **Sesión:** JWT personalizado en cookie `admin_token` (24h)
- **Repositorio:** `SupabaseAdminRepository` usa SERVICE_ROLE_KEY para bypass RLS

### Flujo de Acceso Admin
1. **Usuario creado manualmente** en Supabase Dashboard → Authentication → Users
2. **Perfil creado** en tabla `perfiles_admin` vinculado al usuario de auth
3. **Login** → Valida credenciales en Supabase Auth → Genera JWT propio
4. **Protección** → Layout admin verifica cookie y JWT en cada request

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

### Columnas Relevantes

**productos:**
- Multi-idioma: `titulo_es/en/fr/it/de`, `descripcion_es/en/fr/it/de`
- `precio` (numeric), `foto_url`, `es_especial`, `activo`

**categorias:**
- Multi-idioma: `nombre_es/en/fr/it/de`
- `orden` (integer)

**pedidos:**
- `detalle_pedido` (jsonb): estructura del pedido
- `estado`: pendiente, confirmado, etc.

### Ubicación Cliente Supabase
- **Archivo:** `src/lib/supabaseClient.ts`
- **Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Estilos y Tema

### Tailwind CSS v4
- **Configuración:** CSS-first (no tailwind.config.ts)
- **Archivo principal:** `src/styles/globals.css`
- **Variables CSS:** Tema italiano con colores Verde, Rojo, Oro, Crema, Terracota, Oliva, Espresso

### Colores del Tema (CSS Variables)
```css
--color-primary: #008C45     /* Verde italiano */
--color-accent: #CF0921     /* Rojo italiano */
--color-italian-gold: #F4C430
--color-italian-cream: #F7E7CE
--color-italian-terracotta: #C75B39
--color-italian-olive: #B7B3F
```

### Fuentes
- **Serif:** Playfair Display
- **Sans:** Inter

---

## Principios SOLID Aplicados

### 1. Single Responsibility Principle (SRP)
- Cada repositorio solo maneja una entidad (`SupabaseProductRepository` → solo productos)
- Cada use case tiene una única responsabilidad (`GetMenuUseCase` → obtener menú)
- Los componentes UI tienen una función clara

### 2. Open/Closed Principle (OCP)
- Interfaces de repositorio (`IProductRepository`) abiertas para extensión, cerradas para modificación
- Nuevas implementaciones de BBDD pueden agregarse sin cambiar la lógica de negocio

### 3. Liskov Substitution Principle (LSP)
- `SupabaseProductRepository` implementa `IProductRepository` intercambiable con cualquier otra implementación

### 4. Interface Segregation Principle (ISP)
- Interfaces pequeñas y específicas (`IProductRepository`, `ICategoryRepository`, `IStorageRepository`)
- No hay interfaces monolíticas

### 5. Dependency Inversion Principle (DIP)
- Los use cases dependen de abstracciones (interfaces), no de implementaciones concretas
- `GetMenuUseCase` depende de `IProductRepository` y `ICategoryRepository`, no de Supabase directamente

---

## Seguridad OWASP

### 1. A01: Broken Access Control
- **Implementado:** Cookies `HttpOnly` para token de acceso al carrito
- **Archivo:** `src/app/actions.ts` - verificación JWT server-side
- **Flujo:** Token JWT → Cookie HttpOnly → Verificación en Server Actions

### 2. A02: Cryptographic Failures
- JWT con `jose` library (`scripts/generate-token.ts`)
- Secrets en variables de entorno (`ACCESS_TOKEN_SECRET`)

### 3. A03: Injection
- Zod validation en DTOs (`src/core/application/dtos/product.dto.ts`)
- Parámetros parametrizados en Supabase queries

### 4. A04: Insecure Design
- Clean Architecture para separación de responsabilidades
- Validación en múltiples capas (DTO → Use Case → Repository)

### 5. A05: Security Misconfiguration
- Solo variables públicas necesarias en cliente (`NEXT_PUBLIC_*`)
- Server-only code marcado con `"server-only"` package

### 6. A06: Vulnerable Components
- Dependencias actualizables vía pnpm
- ESLint configurado

### 7: Identification and Authentication
- JWT con expiración (2 horas)
- Limpieza de cookies en logout

### 8: Software and Data Integrity Failures
- Tipos TypeScript estrictos
- Zod para validación de datos

---

## Flujo de Acceso al Carrito (Seguridad)

1. **Generación Token:** `scripts/generate-token.ts` → JWT firmado
2. **Validación:** `src/app/actions.ts` → `jwtVerify()` con `ACCESS_TOKEN_SECRET`
3. **Cookie:** Creación de cookie `access_token` (HttpOnly, Secure)
4. **UI:** Si autenticado → mostrar botones "Añadir", drawer del carrito

---

## Comandos Útiles

```bash
# Desarrollo
pnpm dev

# Build producción
pnpm build

# Lint
pnpm lint

# Generar token acceso (desarrollo)
npx tsx scripts/generate-token.ts
```

---

## Tecnologías Principales

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 | Framework full-stack |
| React | 19.2.0 | UI Library |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | BBDD + Auth + Storage |
| Tailwind CSS | 4.1.9 | Estilos |
| Radix UI | 1.x | Componentes UI accesibles |
| Zod | 3.25.76 | Validación schemas |
| jose | 6.1.3 | JWT |
| Framer Motion | 11.x | Animaciones |
| Lucide React | 0.454.0 | Iconos |

---

## Patrones de Código

### Repository Pattern
```typescript
// Interfaz (dominio)
interface IProductRepository {
  create(data: CreateProductDTO): Promise<Product>;
  findAllByTenant(empresaId: string): Promise<Product[]>;
}

// Implementación (infraestructura)
class SupabaseProductRepository implements IProductRepository { ... }
```

### Use Case Pattern
```typescript
class GetMenuUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly categoryRepo: ICategoryRepository
  ) {}
  
  async execute(empresaId: string): Promise<MenuCategoryVM[]> { ... }
}
```

### Context API (Estado Global)
- `CartProvider`: Estado del carrito (items, total, abierto/cerrado)
- `LanguageProvider`: Idioma actual (i18n)
- `ThemeProvider`: Tema claro/oscuro

---

## Notas Importantes

- **Multi-tenant:** Sistema diseñado para múltiples empresas, filtrado por `empresa_id`
- **i18n:** Soporte para ES, EN, FR, IT, DE (columnas separadas en BBDD)
- **SSR:** Renderizado server-side para SEO y performance
- **Server Actions:** `src/app/actions.ts` para operaciones seguras
- **Server-only:** Servicios que no deben llega al cliente marcados con `"server-only"`
