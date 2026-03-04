# AGENTS.md - Contexto para Agentes IA

## Stack
Next.js 16 + React 19 + TypeScript + Supabase + Tailwind CSS v4 + Cloudflare R2

**Nota:** Next.js 16 usa Turbopack por defecto en desarrollo.

## Arquitectura
Clean Architecture: `domain` → `application` → `infrastructure`

## Principios a Seguir
- **Clean Architecture**: Siempre usar las capas domain → application → infrastructure
- **SOLID**: Dependency Inversion (DIP) - depender de abstracciones, no concreciones
- **OWASP**: JWT, Zod validation, HttpOnly cookies, sanitización de inputs
- **Bundle**: Usar lazy loading con `next/dynamic`, optimizar imports

## Estructura clave
```
src/
├── app/api/admin/     # Rutas API con Zod validation
├── core/
│   ├── domain/       # Interfaces (IProductRepository, etc.)
│   ├── application/  # DTOs (Zod), Use Cases
│   └── infrastructure/  # Supabase/R2 clients singleton
├── components/ui/    # ImageUploader (optimiza imágenes)
└── lib/              # AdminContext, CartContext
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

1. **No usar `telefono` en pedidos** - La columna no existe
2. **Subdominios** - Buscar por `dominio` principal, no por `subdomain_pedidos = true`
3. **Imágenes R2** - Usar cliente singleton, no crear nuevos clientes

## Buenas Prácticas

- Usar clientes singleton: `getSupabaseClient()`, `getS3Client()`
- Zod para validación en todas las API routes
- Labels con `htmlFor` para accessibility
- Props `readonly` en interfaces
- `<Image>` de Next.js para imágenes
- `<Link>` de Next.js para navegación

## Cosas importantes para el agente
- **Footer**: Fondo negro, muestra logo, descripción, fb, instagram, dirección, WhatsApp, email y mapa (iframe)
- **Middleware**: `src/proxy.ts` - autentica JWT para `/api/admin/*`
- **Imágenes**: Se optimizan en cliente (480x480, WebP, 80%)
- **R2**: Cliente singleton en `core/infrastructure/storage/s3-client.ts`
  - `getS3Client()` - Obtener cliente
  - `getR2Config()` - Obtener config (bucket, domain)
  - `deleteImageFromR2(url)` - Eliminar imagen del bucket
- **R2 CORS**: Necesita configurarse para uploads directos (ejecutar `scripts/setup-r2-cors.ts`)
- **Supabase**: Cliente singleton en `core/infrastructure/database/supabase-client.ts`
- **Validation**: Todas las rutas API usan Zod schemas
- **Subdominios**: `pedidos.dominio.com` activa el carrito
- **Build**: "Skipping validation of types" es normal en Next.js 16
- **Promociones**: 
  - `/api/admin/promociones` - GET lista, POST crea y envía emails
  - `/api/admin/promociones/unsubscribe` - Ruta pública para darse de baja (sin JWT)
  - Imagen se sube a R2 en carpeta `{empresaSlug}/promo-*.webp`
  - Al crear nueva promo, se borra imagen anterior de R2
  - Email incluye logo de empresa (de empresas.logo_url) + imagen promo, y los enlaces de suscripción/baja usan el `dominio` de la empresa para generar las URLs.
- **Configuración Empresa**: 
  - `/admin/configuracion` - Datos de contacto (fb, instagram, url_mapa, direccion, telefono_whatsapp, email_notification)
  - API: `/api/admin/empresa` - GET/PUT con los campos nuevos

## Comandos
```bash
pnpm dev    # Desarrollo
pnpm build  # Build
pnpm lint   # Lint
```
