# Contexto del Proyecto

> Ver también: [bbdd.md](./bbdd.md) | [FLOW_CARRITO.md](./FLOW_CARRITO.md) | [structure.txt](./structure.txt)

## Qué es
Plataforma multi-tenant de pedidos online para restaurantes/tiendas.

## Flujo de Datos Principal

### Cliente (público)
1. Usuario visita `dominio.com` o `pedidos.dominio.com`
2. `page.tsx` usa `getMenuUseCase` → `getEmpresaByDomain()` → Supabase
3. Muestra menú con categorías y productos (i18n: es/en/fr/it/de)
4. Si es subdominio pedidos → muestra carrito (`cart-drawer.tsx`)
5. Usuario hace pedido → `POST /api/pedidos` → `pedidoUseCase.create()` → guarda en Supabase

### Admin (panel protegido)
1. Admin entra a `/admin/login` → `POST /api/admin/login`
2. JWT en cookie HttpOnly
3. Dashboard `/admin` con estadísticas, CRUD de productos, categorías, pedidos, clientes, promociones
4. Configuración de empresa: colores, logo, redes sociales, WhatsApp

### Super Admin (panel global)
1. Super Admin entra a `/admin/login` con cuenta de rol `superadmin`
2. Redirige automáticamente a `/superadmin`
3. Dashboard con resumen de todas las empresas (pedidos, clientes, productos, ranking)
4. Click en "Editar" en una empresa → establece cookie `superadmin_empresa_id` y redirige a `/admin`
5. Las páginas de admin (productos, categorías, pedidos, clientes, configuración) leen la cookie para determinar qué empresa gestionar
6. Todas las APIs aceptan `empresaId` como query param para superadmin

### Imágenes
- Upload: cliente optimiza (WebP 480x480 para productos, 1920x1080 para banners) → `POST /api/admin/upload-image` → Cloudflare R2
- URLs: `https://imagenes.almadearena.es/{slug}/{año}/{mes}/{uuid}.webp`
- **Banner**: Usa `optimizeBannerImage` - calidad 92%, máx 1920x1080
- **Productos**: Usa `optimizeImage` - calidad 80%, máx 480x480
- **Preview**: Usa `object-contain` para mostrar imagen completa sin recortes

## Stack
- Next.js 16 (App Router) + React 19
- TypeScript + Tailwind CSS v4
- Supabase (PostgreSQL + Auth)
- Cloudflare R2 (imágenes)
- Upstash Redis (rate limiting + JWT revocation list)
- Brevo (emails promocionales)

## Seguridad (auditoría completa — 20/20 SECs)
- `proxy.ts` — JWT auth, CSRF timingSafeEqual, JWT revocation check (Redis), CSP nonces por request
- `lib/csrf.ts` — tokens HMAC-SHA256 con comparación timing-safe
- `lib/token-revocation.ts` — revocación de JWT en logout via Upstash REST API (Edge-compatible)
- `lib/unsubscribe-token.ts` — tokens HMAC firmados para unsubscribe (TTL 7d, prefijo de dominio)
- Rate limiting en **todos** los endpoints (login, público, admin mutativos)
- Precios recalculados server-side en pedidos (base + complementos)
- RLS: `anon` explícitamente denegado en tablas sensibles

## Dominios configurados
- `almadearena.es` - menú sin carrito
- `pedidos.almadearena.es` - menú con carrito

## Superadmin - Implementación Técnica

### Archivos clave
- `src/app/superadmin/page.tsx` - Dashboard con lista de empresas y estadísticas globales
- `src/app/superadmin/layout.tsx` - Layout autenticado (verifica rol superadmin)
- `src/app/api/superadmin/switch-empresa/route.ts` - Establece cookie y redirige
- `src/app/api/superadmin/empresas/route.ts` - Lista empresas con stats
- `src/core/application/use-cases/superadmin.use-case.ts` - Lógica de negocio
- `src/core/domain/repositories/ISuperAdminRepository.ts` - Interfaz del repositorio
- `src/core/infrastructure/database/SupabaseSuperAdminRepository.ts` - Implementación

### Flujo de edición de empresa
1. Superadmin hace click en "Editar" en `/superadmin`
2. Llama a `/api/superadmin/switch-empresa?empresaId=xxx`
3. La API:
   - Verifica JWT (proxy valida token + rol superadmin)
   - Establece cookie `superadmin_empresa_id` con expiry 1 hora
   - Redirige a `/admin`
4. El layout de admin:
   - Detecta que es superadmin (cookie presente)
   - Lee empresa de la cookie
   - Pasa `overrideEmpresaId` al AdminProvider
5. Las páginas de admin usan `effectiveEmpresaId` para todas las operaciones
6. Las APIs aceptan `empresaId` como query param para superadmin

### Cambios en APIs para soportar superadmin
- `requireAuth()` retorna `isSuperAdmin` flag
- `requireRole()` acepta `['admin', 'superadmin']`
- **APIs que soportan superadmin:**
  - `/api/admin/empresa` - GET/PUT requieren `empresaId` query param
  - `/api/admin/upload-image` - POST requiere `empresaId` query param
  - `/api/admin/productos` - GET/POST/PUT/DELETE requieren `empresaId` query param
  - `/api/admin/categorias`, `/api/admin/clientes`, etc. - similarly

### Banner flotante en modo superadmin
- En `src/app/admin/(protected)/layout.tsx`
- Banner fixed con z-index alto
- Muestra empresa actual y botón "Volver al panel"

### Optimización de imágenes (2024)
- **banner_fit**: opción en empresa para ajustar display (contain/cover/fill)
- `object-contain` por defecto para mostrar imagen completa sin recortes
- Diferentes niveles de calidad:
  - Banner: 1920x1080, 92% quality WebP
  - Productos: 480x480, 80% quality WebP
- Ver `src/lib/image-utils.ts` y `src/components/ui/image-uploader.tsx`
