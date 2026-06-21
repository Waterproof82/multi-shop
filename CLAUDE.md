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

## 🧑‍🍳 Sistema de Camarero (Waiter Flow)

### Flujo de validación de pedidos (`validacion_pedidos_habilitada`)
- Cuando está activo, pedidos de clientes → `estado='pendiente_validacion'` en espera del camarero.
- Camarero valida en `/waiter/pendientes` → POST `/api/waiter/pendientes/validate`.
- El endpoint mueve el pedido a `pendiente` y crea `pedido_item_estados` para cocina/bar.
- Los pedidos en `pendiente_validacion` están EXCLUIDOS de cocina/bar hasta ser validados.
- `isWaiterRequest()` detecta token de camarero → bypasea la cola de validación.

### `/waiter/pendientes` — Cola de validación
- Polling cada 3 s a `/api/waiter/pendientes/orders`.
- Por pedido: dos botones separados — **Confirmar ítems cocina (N)** y **Confirmar ítems bar (N)**.
- Al confirmar solo cocina, los ítems de bebida quedan retenidos automáticamente (y vice versa).
- Botón select/deselect all en la barra del timer de cada pedido.
- Iconos `UtensilsCrossed` (amber) y `Wine` (azul) por ítem; naranja si retenido.
- Claves i18n: `pendientesConfirmar`, `pendientesConfirmarBar`, `pendientesSeleccionarTodos`, `pendientesDeseleccionarTodos`.

### `waiter-banner.tsx` — Badging y conteos
- Badge naranja de retenidos junto al botón de cocina (`counts.cocina.retenidos`).
- Badge naranja de retenidos junto al botón de bar (`counts.bebidas.retenidos`).
- El ícono del carrito se oculta en: `/waiter`, `/waiter/pendientes`, `/waiter/kitchen`, `/waiter/bar`.
- **Indicador de llamadas:** `<div>` no interactivo con `BellRing` animado (animate-pulse) + badge dorado cuando `counts.llamadas > 0`. Solo visual, sin acción.
- **Sonido:** `playNotificationSound()` usa `new Audio('/bell.mp3')`. Suena cuando aumenta `total`, `listos`, `pendientes` o `llamadas`. Guard: `pathname.startsWith('/waiter')`.

### `supabase-pedido.repository.ts` — Conteo cocina/bar
- `fetchAllComidaItems`: excluye `pendiente_validacion` del filtro NOT IN (evita leak antes de validar).
- `tallyCocinaItems`: cuenta `retenidos` solo desde `pedido_item_estados`; ya no llama a `findAllRetenidos` en paralelo (evitaba doble conteo).
- `findAllRetenidos`: sigue en uso por `/api/waiter/kitchen/orders/route.ts` — NO es código huérfano.

### `/api/waiter/orders/counts` — CountsPayload
Devuelve `{ cocina: {total,listos,retenidos}, bebidas: {total,listos,retenidos}, pendientes, llamadas }`.
`llamadas` = count de `mesa_sesiones` con `llamada_activa=true AND cerrada_at IS NULL`.

### `mesa-orders-client.tsx` — Ticket del camarero
- Sin badges de estado de pedido (eliminados).
- Ítem con `estado='retenido'` en algún pedido → nombre del ítem en color naranja.
- **Botón de pago:** etiqueta dinámica — con división activa → `"Marcar pago de una parte · €X"`, sin división → `"Marcar pago completo"`. Incluye icono `<CreditCard>`.

### 📞 Call Waiter — Avisar al camarero
**Flujo completo:**
1. Cliente pulsa `BellRing` en la cabecera (`site-header-client.tsx`) → aparece solo cuando `?mesa=` en URL y no es modo camarero.
2. POST `→ /api/mesas/[mesaId]/call-waiter` — endpoint público, rate-limited. Actualiza `mesa_sesiones.llamada_activa = true`.
3. Cliente ve popup "Camarero avisado" (30 s auto-dismiss, fixed centrado, no interactivo).
4. Waiter grid (`waiter-login-form.tsx`) detecta `mesa.llamadaActiva = true` → botón pulsante dorado en esquina superior-izquierda de la tarjeta. Al pulsar → POST `/api/waiter/mesas/[mesaId]/dismiss-call` → `llamada_activa = false`.
5. `WaiterBanner` muestra indicador dorado no interactivo mientras `counts.llamadas > 0`, con animación pulse. Suena `bell.mp3` cuando el contador sube.

**DB:** `supabase/migrations/20260621000001_mesa_llamada_activa.sql` — añade columna `llamada_activa BOOLEAN DEFAULT false` a `mesa_sesiones` y reconstruye RPC `get_mesas_with_sessions` para incluirla.
**Domain:** `MesaWithSession.llamadaActiva: boolean` (mapeado desde `row.llamada_activa`).

### 🔔 Sistema de Sonido (bell.mp3)
- Archivo: `public/bell.mp3`
- Reemplaza el oscilador AudioContext que había en todos los puntos.
- **`waiter-banner.tsx`:** Suena en `/waiter/*` cuando aumentan `cocina.total`, `cocina.listos`, `bebidas.total`, `bebidas.listos`, `pendientes` o `llamadas`.
- **`/kitchen/page.tsx`:** Suena localmente cuando aumenta el conteo de ítems `pendiente | en_preparacion`. NO suena al marcar `en_preparacion`, solo al recibir ítems nuevos.
- **`/waiter/kitchen/page.tsx`:** El sonido listo lo gestiona el banner, no esta página.
- **IMPORTANTE:** El banner renderiza en todas las páginas (incluyendo la del cliente). El guard `pathname.startsWith('/waiter')` es CRÍTICO para no reproducir sonido en la carta del cliente.

### 🍽️ Kitchen page — Swipe colors
`/app/kitchen/page.tsx`:
- Swipe de `pendiente` → `en_preparacion`: fondo reveal = `EN_PREP_COLOR.bg`.
- Swipe de `en_preparacion` → `listo`: fondo reveal = `COUNTDOWN_COLOR.bg` (verde).
- Swipe inverso (back): fondo reveal = `PENDIENTE_COLOR.bg` para en_preparacion, `transparent` si pendiente.
- Atributos: `data-hint-fwd` y `data-hint-back` en el outer div con background dinámico.

### 🧑‍🍳 Waiter Kitchen — Swipe retener
`/app/waiter/kitchen/page.tsx`:
- Swipe de ítem `nuevo` → `retenido`: fondo reveal = `RETENIDO_COLOR.bg` (naranja/ámbar).
- Hint del swipe incluye icono `<Pause>` + texto "Retener".

### 🟢 clienteActivo — Activación automática
`client-menu-page.tsx`: Al montar (si no es modo camarero y hay `?mesa=` en URL), hace fire-and-forget POST a `/api/mesas/[mesa]/activate`. Así `clienteActivo = true` se registra en cuanto el cliente abre la carta, sin esperar al primer ítem del carrito.

Impacto en el grid: "Cerrar mesa" aparece cuando `activeOrderCount > 0 OR clienteActivo` (no cuando el camarero suplanta sin cliente real).

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