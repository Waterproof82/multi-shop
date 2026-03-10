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

### Imágenes
- Upload: cliente optimiza (WebP 480x480) → `POST /api/admin/upload-image` → Cloudflare R2
- URLs: `https://imagenes.almadearena.es/{slug}/{año}/{mes}/{uuid}.webp`

## Stack
- Next.js 16 (App Router) + React 19
- TypeScript + Tailwind CSS v4
- Supabase (PostgreSQL + Auth)
- Cloudflare R2 (imágenes)
- Upstash Redis (rate limiting)
- Brevo (emails promocionales)

## Dominios configurados
- `almadearena.es` - menú sin carrito
- `pedidos.almadearena.es` - menú con carrito
