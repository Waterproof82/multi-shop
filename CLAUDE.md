# CLAUDE.md - Contexto multi_shop

## 🛠 REGLA DE ORO (Post-cambio obligatorio)
Tras CADA modificación: `pnpm lint && pnpm build`. No marcar tarea como completada si fallan.

## 🏗 Arquitectura y Capas
Clean Architecture: `API Route (Zod) → Use Case (Logic) → Repository (Infra)`.
- **Domain (`core/domain/`):** Entidades (types.ts), interfaces y constantes.
- **Application (`core/application/`):** DTOs (Zod) y Use Cases.
- **Infrastructure (`core/infrastructure/`):** Implementaciones de Repos, Singletons (Supabase/S3), API helpers.

**Reglas de Flujo:**
1. NUNCA acceder a DB desde routes/pages. Siempre vía Use Case.
2. NUNCA `createClient()` manual. Usar `getSupabaseClient()` o `getSupabaseAnonClient()`.
3. NUNCA usar `any`. Usar `Record<string, unknown>` o tipos de dominio.
4. **Mappers:** Repos devuelven CamelCase. API responde con snake_case si el cliente lo requiere.

## 🚦 Patrón Result<T, E> y Errores
Todo el codebase usa `Result<T, AppError>`.
- **Repo:** Captura error → `logger.logAndReturnError` → retorna `{ success: false, error }`.
- **API:** Usa `handleResult(result)` para mapear automáticamente a status HTTP (400, 401, 404, 500).
- **Códigos:** Centralizados en `core/domain/constants/api-errors.ts`.

## 🔒 Seguridad (Checklist Crítico)
- **Auth:** JWT en cookies HttpOnly. Verificación en `proxy.ts` (API) y `authAdminUseCase` (SSR).
- **RBAC:** Mutaciones en `/api/admin/*` requieren `requireRole(request, ['admin', 'superadmin'])`.
- **Zod:** `safeParse` OBLIGATORIO + `max()` en todos los strings + `try/catch` en `request.json()`.
- **PII:** Prohibido loguear emails/teléfonos. Usar datos anonimizados.
- **Secrets:** Lectura lazy vía funciones (ej: `getTokenSecret()`), nunca constantes de módulo.
- **CSRF:** Validado en proxy para métodos mutativos de admin.

## 💾 Base de Datos (Trampas Comunes)
- `pedidos`: NO tiene columna `telefono` (está en `clientes`).
- `productos`: Campos i18n (`titulo_es`, `titulo_en`, etc.).
- `tenant`: Siempre derivar empresa vía `parseMainDomain(domain)`.
- `superadmin`: `empresaId` es null. Se pasa por query param `?empresaId=...`.

## 🗄️ Migraciones — Checklist Obligatorio por Tabla Nueva

Toda migración que cree una tabla nueva DEBE incluir estos tres bloques, en este orden:

### 1. RLS
```sql
ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;

-- Denegar acceso anon explícitamente
CREATE POLICY "No direct anon access to mi_tabla"
  ON public.mi_tabla FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Policies por rol authenticated usando get_mi_empresa_id()
CREATE POLICY "Admin ve mi_tabla"
  ON public.mi_tabla FOR SELECT
  USING (empresa_id = get_mi_empresa_id());
-- ... INSERT / UPDATE / DELETE con mismo patrón
```

### 2. GRANTs explícitos (obligatorio desde oct 2026 — Supabase Data API)
```sql
-- service_role: backend (bypasses RLS pero necesita grant de tabla)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO service_role;

-- authenticated: admins con RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO authenticated;

-- anon: solo si la tabla es pública (ej: productos, categorias, empresas)
-- GRANT SELECT ON public.mi_tabla TO anon;
```

### 3. Función auxiliar de aislamiento de tenant
`get_mi_empresa_id()` — definida en `20260527000002_create_get_mi_empresa_id.sql`.
Retorna el `empresa_id` del admin autenticado vía `auth.uid()` → `perfiles_admin`.
Usar siempre en RLS policies para aislar datos por empresa.

## 🎨 UI & Design System (Tailwind v4)
- **Tokens:** NUNCA hardcodear colores. Usar variables CSS del tenant.
- **Accesibilidad:** Touch targets min 44px. Focus rings estándar. `aria-labels` traducidos.
- **I18n:** Usar `t()` de `@/lib/translations` para TODO el texto de UI.
- **Imágenes:** Usar `ImageUploader` (auto-optimiza WebP). `object-contain` por defecto.

## 🚀 Comandos Útiles
- Dev: `pnpm dev`
- Build: `pnpm build` (Ignorar "Skipping validation of types")
- Lint: `pnpm lint`

## 🧑‍🍳 Sistema de Camarero — Trampas Críticas

- Pedidos en `estado='pendiente_validacion'` EXCLUIDOS de cocina/bar hasta validar. `isWaiterRequest()` bypasea esta cola.
- `from_validation` en `pedido_item_estados`: `false` = retenido en cocina; `true` = devuelto a pendientes. Nunca mezclar.
- `findAllRetenidos` en `supabase-pedido.repository.ts` NO es código huérfano — lo usa `/api/waiter/kitchen/orders`.
- `WaiterBanner` renderiza en TODAS las páginas. El sonido `bell.mp3` SOLO puede sonar con guard `pathname.startsWith('/waiter')`.
- `clienteActivo` se activa al abrir la carta (mount en `client-menu-page.tsx`), no al añadir al carrito.
- `llamada_activa` vive en `mesa_sesiones`, no en `mesas`. Se expone vía RPC `get_mesas_with_sessions`.
- `CountsPayload` incluye `llamadas` (mesas con `llamada_activa=true`). Ver `docs/context/waiter-panel.md` para el flujo completo.
- **`pedidos.estado` NUNCA se actualiza** por cocina/bar al marcar ítems. La source of truth real está en `pedido_item_estados`. La route `/api/mesas/[mesaId]/orders` sintetiza el estado efectivo de cada pedido comparando item-level estados (`listo`/`servido`/`cancelado`). NO leer `pedido.estado` directamente para saber si un pedido está servido.
- **`hasPlatosPoServir`** en `mesa-orders-client.tsx` bloquea pago y cierre cuando algún pedido sintetizado tiene estado ∈ `{pendiente_validacion, pendiente, en_preparacion, preparado}`. Ver `docs/context/waiter-ticket-ux.md`.

## 🔍 SEO Multi-Tenant

### Archivos Clave
- `src/app/layout.tsx` - Metadata dinámica, hreflang, OG tags
- `src/app/robots.ts` - Robots.txt dinámico por dominio
- `src/app/sitemap.ts` - Sitemap con lastModified desde BBDD
- `src/app/not-found.tsx` - 404 con meta tags dinámicos
- `src/components/json-ld.tsx` - Schema.org Restaurant + FAQ + Menu

### Features SEO Implementadas
- **Metadata dinámica:** Título, descripción, OG por empresa (multi-tenant)
- **hreflang:** Idiomas es/en/fr/it/de configurados
- **Robots.txt:** Bloquea /admin/, /api/, /superadmin/ por dominio
- **Sitemap:** lastModified desde `actualizado_en` de empresa
- **Schema.org:** Restaurant (geo desde urlMapa), FAQPage, Menu con MenuItem por plato
- **Geo coordinates:** Parsea lat/lng desde Google Maps URL

### Campos BBDD para SEO
- `empresa.dominio` - Dominio principal
- `empresa.slug` - Slug para URLs
- `empresa.descripcion` - Descripciones i18n (es/en/fr/it/de)
- `empresa.url_mapa` - Google Maps (parsea coordenadas)
- `empresa.updated_at` / `actualizado_en` - Para sitemap