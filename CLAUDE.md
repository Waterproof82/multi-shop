# CLAUDE.md - Contexto multi_shop

## 🛠 REGLA DE ORO (Post-cambio obligatorio)
Tras CADA modificación: `pnpm lint && pnpm build`. No marcar tarea como completada si fallan.

## 🔬 SonarLint — Checklist pre-código (aplicar desde el primer momento)

### S3776 — Complejidad cognitiva ≤ 15
- Extraer cualquier bloque `if/else` complejo o cadena de ternarios a funciones puras de módulo.
- Si un componente tiene dos rutas de render muy distintas (ej: countdown vs normal), dividirlo en `ComponenteA` + `ComponenteB` + dispatcher delgado.

### S2004 — Máximo 4 niveles de funciones anidadas
Contar desde el componente: `Componente → useCallback → setInterval → .then → setItems(prev => ...)` ya son 5.
- **Predicados de `.filter()`**: siempre extraer a función de módulo: `function notMatchingItem(...) { return i => ...; }`
- **Lógica con efectos secundarios** (fetch + setState): extraer a `useCallback` propio para que los callbacks internos no estén 4 niveles abajo del componente.
- Regla: si ves `setItems(prev => prev.filter(i => ...))` dentro de un `.then()` dentro de un `useCallback` → extrae el predicado.

### S3358 — Prohibido ternario anidado
```typescript
// MAL
const x = a ? 'r' : b ? 'o' : 'g';
// BIEN — función de módulo con if/return, o if/else
function resolveX(a, b) { if (a) return 'r'; if (b) return 'o'; return 'g'; }
```

### S4325 — No casts redundantes
- `language as Parameters<typeof t>[1]` → usar `const { language: lang } = useLanguage()`
- Tras `'prop' in unionValue`, TypeScript ya estrecha el tipo. No hace falta `(value as Tipo).prop`.

### S6759 — Props siempre `Readonly<Props>`
```typescript
function MiComponente({ ... }: Readonly<MiComponenteProps>) { ... }
```

### S7735 — Condiciones en positivo
```typescript
// MAL: x !== null ? A : B  →  BIEN: x === null ? B : A
```

### S6819 / S6848 — HTML semántico
- `<div role="button">` → `<button type="button">`
- `<div role="dialog">` → `<dialog open>`
- Backdrop de modal: `<button type="button" className="absolute inset-0" aria-label="Cerrar" />`

### Tipo `Lang` en helpers que usan `t()`
```typescript
type Lang = Parameters<typeof t>[1];
// Usar como tipo de prop en sub-componentes o helpers de módulo
```

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

## ⚡ Realtime — Patrones Críticos (Waiter System)

### Trampas conocidas

1. **React StrictMode double-mount con canal de nombre fijo** → el cleanup del primer mount cierra el canal; el segundo mount recibe un canal ya cerrado y nunca escucha. **Fix para `postgres_changes`:** usar `useRef` con sufijo aleatorio: `useRef(\`waiter-banner-\${Math.random().toString(36).slice(2)}\`)` y pasar ese ref como nombre de canal. **Fix para broadcast channels (nombre fijo obligatorio):** usar un guard de estado async — por ej. `if (!waiterEmpresaId) return` — de modo que el efecto hace early return en el segundo mount de StrictMode (cuando el fetch todavía no terminó) y las suscripciones se crean una sola vez. Afecta a `/kitchen` standalone que usaba canales broadcast fijos sin guard: `src/app/kitchen/page.tsx`.

2. **`postgres_changes` silenciado en cliente singleton** → Supabase JS comparte una única conexión WebSocket. Varios componentes suscribiendo al mismo tabla desde distintos canales pueden dejar de recibir eventos. **Fix híbrido:** el componente central (`WaiterBanner`) escucha `postgres_changes` y además dispara un `CustomEvent('waiter-realtime-update')` por DOM, que los demás componentes capturan como fallback.

3. **Race condition en validate loop** → cuando pendientes valida múltiples pedidos secuencialmente, el trigger de DB lanza un broadcast después de cada PATCH. El relay DOM llama `fetchPendientes()` entre iteraciones y devuelve estado parcial (el segundo pedido sigue en `pendiente_validacion`). **Fix:** `confirmingRef` (mirror de `useRef` del estado `confirming`); el relay retorna temprano si `confirmingRef.current.size > 0`. El `finally` del loop hace el fetch autoritativo.

4. **Mesa grid badge no se actualiza al marcar ítems en cocina** → la cocina modifica `pedido_item_estados`, que no toca `mesa_sesiones`. `WaiterLoginForm` sólo escuchaba `mesa_sesiones`. **Fix:** agregar suscripción al broadcast `waiter-items-update` (canal `'waiter-items-update'`, evento `'item-update'`).

5. **`removeSessionItemUseCase` bypasea `pedido_item_estados`** → cuando el camarero elimina ítems desde el ticket del waiter, `removeSessionItemUseCase` hace DELETE o UPDATE directamente en `pedidos.detalle_pedido`, sin tocar `pedido_item_estados`. El trigger `notify_waiter_items_update` solo escucha esa tabla → nunca disparaba → el grid de mesas del TPV quedaba stale. **Fix:** trigger `pedidos_notify_item_update` (migración `20260721000002`) en la tabla `pedidos`, evento DELETE o UPDATE OF `detalle_pedido`/`total`, emite el mismo broadcast `waiter-items-update`. `TpvCatalogProvider` también suscribe a ese canal para refrescar totales del grid.

6. **Race condition broadcast vs. auto-cancel en MostradorClient** → `realtime.send()` dentro de un trigger de DB es asíncrono: el broadcast `item-update` puede llegar al cliente antes de que la transacción que cancela el pedido commitee. El refresh inmediato devuelve el pedido todavía activo. **Fix:** añadir `postgres_changes` en `pedidos` filtrado por `sesion_id` (canal `tpv-pedidos-{sesionId}`) en `MostradorClient`. Ese evento es transaccional y solo llega después del commit completo.

### Arquitectura de canales activa

| Canal | Tipo | Tabla/evento | Quién escucha |
|---|---|---|---|
| `waiter-banner-{uid}` | postgres_changes | pedidos, pedido_item_estados, mesa_sesiones | WaiterBanner |
| `waiter-new-order` | broadcast `new-order` | trigger notify_waiter_new_order (todos los INSERTs) | WaiterBanner, MostradorClient |
| `waiter-new-order-kitchen` | broadcast `new-order` | trigger notify_waiter_new_order | WaiterKitchenPage |
| `waiter-new-order-bar` | broadcast `new-order` | trigger notify_waiter_new_order | BarPage |
| `waiter-items-update` | broadcast `item-update` | trigger notify_waiter_items_update + trigger pedidos_notify_item_update | WaiterBanner, BarPage, WaiterLoginForm, MostradorClient, TpvCatalogProvider |
| `tpv-pedidos-{sesionId}` | postgres_changes | pedidos (UPDATE, filter sesion_id) | MostradorClient |
| `tpv-sesion-close-{sesionId}` | postgres_changes | mesa_sesiones (UPDATE, filter id) | MostradorClient |
| `waiter-kitchen-{uid}` | postgres_changes | pedido_item_estados, pedidos | WaiterKitchenPage |
| `waiter-bar-{uid}` | postgres_changes | pedido_item_estados, pedidos | BarPage |
| `waiter-pendientes-{uid}` | postgres_changes | pedidos, pedido_item_estados, mesa_sesiones | WaiterPendientesPage |
| `waiter-login-mesas-{uid}` | postgres_changes | mesa_sesiones | WaiterLoginForm |
| `kitchen-standalone` | postgres_changes | pedido_item_estados, pedidos | /kitchen page |

### DOM relay: `waiter-realtime-update`

`WaiterBanner` dispara `globalThis.dispatchEvent(new CustomEvent('waiter-realtime-update'))` cuando recibe cualquier update de Realtime. Los componentes waiter lo escuchan como fallback. **Nunca** hacer fetch en el handler si `confirmingRef.current.size > 0`.

---

## 🔔 WaiterBanner — Re-autenticación sin recarga

`WaiterBanner` verifica sesión al montar y en cada cambio de `pathname`. Si la sesión expira y el camarero mete el PIN en `WaiterLoginForm`, el `pathname` no cambia → el banner no se entera.

Solución: `WaiterLoginForm.handlePinSubmit` dispara `window.dispatchEvent(new CustomEvent('waiter-auth-changed'))` al hacer login. `WaiterBanner` escucha ese evento y re-llama `/api/waiter/me`.

## 🧑‍🍳 Sistema de Camarero — Trampas Críticas

- **Rutas públicas `/api/mesas/*` NO reciben `x-empresa-id` del proxy** — el proxy solo lo inyecta en rutas autenticadas (admin/waiter/TPV). Todas las rutas de mesa que el cliente llama directamente (`call-waiter`, `orders`, `activate`, `division`, `propina`) deben derivar `empresaId` por dominio: `getDomainFromHeaders()` → `parseMainDomain()` → `findByDomain()`. Usar siempre el patrón de `pedidos/route.ts`.
- **`call-waiter` muestra éxito visual aunque falle** — `setCalled(true)` en `site-header-client.tsx` corre sin comprobar el status HTTP. Si la ruta devuelve 400, el cliente ve "Camarero avisado" pero la DB no se actualiza y en `/waiter` no aparece nada.
- Pedidos en `estado='pendiente_validacion'` EXCLUIDOS de cocina/bar hasta validar. `isWaiterRequest()` bypasea esta cola.
- `from_validation` en `pedido_item_estados`: `false` = retenido en cocina; `true` = devuelto a pendientes. Nunca mezclar.
- `findAllRetenidos` en `supabase-pedido.repository.ts` NO es código huérfano — lo usa `/api/waiter/kitchen/orders`.
- `WaiterBanner` renderiza en TODAS las páginas. El sonido `bell.mp3` SOLO puede sonar con guard `pathname.startsWith('/waiter')`.
- `clienteActivo` se activa al abrir la carta (mount en `client-menu-page.tsx`), no al añadir al carrito.
- `llamada_activa` vive en `mesa_sesiones`, no en `mesas`. Se expone vía RPC `get_mesas_with_sessions`.
- `CountsPayload` incluye `llamadas` (mesas con `llamada_activa=true`). Ver `docs/context/waiter-panel.md` para el flujo completo.
- **`validated_at`** en `pedidos` (nullable): se graba al validar en `/waiter/pendientes`. `findKitchenOrders` y `findBarOrders` usan `validated_at ?? created_at` como `createdAt` — así el timer de cocina/bar cuenta desde que el camarero lanzó el pedido, no desde que el cliente lo hizo.
- **`countBebidasTotal`** excluye `estado='cancelado'` además de `'servido'` para que el badge de bebidas en WaiterBanner descuente cancelaciones correctamente.
- **Pausa en pendientes**: en `handleConfirmBoth`, la pausa (⏸) prevalece sobre la selección (✓). Un ítem puede estar simultáneamente seleccionado Y pausado → va a `pausedIndices` → kitchen retenido. NO usar `&& !selected.has(...)` en ese filtro.
- **`pedidos.estado` NUNCA se actualiza** por cocina/bar al marcar ítems. La source of truth real está en `pedido_item_estados`. La route `/api/mesas/[mesaId]/orders` sintetiza el estado efectivo de cada pedido comparando item-level estados (`listo`/`servido`/`cancelado`). NO leer `pedido.estado` directamente para saber si un pedido está servido. **Ciclo de vida completo de `pedidos.estado`**: `pendiente_validacion` (creado) → `pendiente` (validado o directoACocina) → `cancelado` (trigger `trg_auto_cancel_pedido`) → `cerrado` (cobro via `registrarCobroUseCase`). El historial del turno lee `pedidos.estado` crudo; sin el paso a `cerrado` al cobrar, aparecerían como `pendiente`.
- **Trigger `trg_auto_cancel_pedido`** (migración `20260721000001`): cuando TODOS los ítems de un pedido tienen fila en `pedido_item_estados` con `estado='cancelado'`, el trigger setea `pedidos.estado='cancelado'` automáticamente. Esto sincroniza el estado del pedido con la cancelación ítem a ítem desde Waiter Pendientes y Kitchen. El trigger corre dentro de la transacción del INSERT/UPDATE — después del commit, `MostradorClient` recibe el evento `postgres_changes` y oculta el pedido del ticket.
- **`normalizePedidoOrder` filtra ítems cancelados individualmente** — `GET /api/tpv/pedidos` sintetiza `cancelledItemsByPedido` desde `pedido_item_estados` y los excluye del array `items` devuelto. El total se recalcula sin esos ítems. Si todos los ítems de un pedido están cancelados, el pedido se omite por completo (sintetizado como `cancelado`).
- **`hasPlatosPoServir`** en `mesa-orders-client.tsx` bloquea pago y cierre cuando algún pedido sintetizado tiene estado ∈ `{pendiente_validacion, pendiente, en_preparacion, preparado}`. Ver `docs/context/waiter-ticket-ux.md`.
- **`propina_cents`** en `mesa_sesiones`: propina acordada por la mesa en céntimos. Se expone como `propinaCents` en `GET /api/mesas/[mesaId]/orders` y se suma al total cobrado en Redsys (full payment y división). Actualizable por cualquier participante vía `PATCH /api/mesas/[mesaId]/propina`. Ver `docs/context/propina.md`.

## 📦 Sistema de Stock & Mermas — Trampas Críticas

> Ver doc completo: `docs/context/stock-system.md`

- **Columna en `productos` es `activo`**, no `disponible`. El trigger y `rehabilitarProductos()` usan `activo`.
- **Trigger `deducir_stock_on_servido`** resuelve `producto_id` desde `pedidos.detalle_pedido->item_idx->>'producto_id'` (JSONB). Si el campo no existe en el payload de `createMesaOrder`, el trigger salta silenciosamente sin descontar. Asegurarse de que `detalle_pedido[item_idx].producto_id` esté siempre presente al crear pedidos.
- **`movimientos_stock.ingrediente_id` es nullable** (desde migration 4) — filas `sin_receta` tienen `NULL`. Todo mapper debe usar `(row.ingrediente_id as string) ?? null`, nunca `as string` directo.
- **`replaceReceta` es destructiva**: `PUT /api/admin/stock/recetas/[productoId]` borra y reinserta todos los items. El cliente debe enviar la lista COMPLETA, no un delta.
- **`cantidadActual` nunca por PUT**: `PUT /api/admin/stock/ingredientes/[id]` ignora cantidad. Usar `/ajuste` o `/mermas`.
- **Re-habilitación**: `ajustarStockUseCase` solo re-habilita si `delta > 0` y `cantidadActual >= umbralAlerta` tras el ajuste. Consistente con el trigger — actúa solo sobre el ingrediente modificado.
- **`findLowStockAlerts` filtra en memoria**: supabase-js no soporta comparaciones col-to-col. Se traen todos los ingredientes con `umbral_alerta > 0` y se filtra en JS. No usar `.lt('cantidad_actual', 'umbral_alerta')` — no funciona.
- **Sidebar stock**: `requiresRestaurant: true` en los tres ítems de stock — invisible para tiendas.
- **`LowStockBadge`** montado en `TpvHeader` y `CobroMetodoPropina`. Nunca bloquea el flujo de cobro.
- **`/api/admin/stock/ingredientes` NO sirve para el TPV** — `resolveAdminContext` exige rol `admin|superadmin`. Los encargados (por PIN o admin_token) reciben 403. Usar `/api/tpv/stock/ingredientes` desde contexto TPV — acepta `encargado|admin|superadmin` vía `requireAuth`.

## 🍽 Sistema Tipo Producto (Restaurante)

- **`categorias.tipo_producto`** (`'comida'|'bebida'`, DEFAULT `'comida'`) es la fuente de verdad para el enrutado cocina/bar. NO leer `productos.tipo_producto` para determinar el tab del menú.
- Cambiar el tipo de una categoría actualiza en cascada todos sus productos (`SupabaseCategoryRepository.update`).
- Crear un producto con `categoria_id` → el repositorio hereda el tipo de la categoría automáticamente.
- El toggle Comida/Bebidas del menú público (`getCategoryTab`) lee `cat.tipoProducto` directamente; ya no infiere desde los items.
- Subcategorías sin productos no se renderizan (`menu-section.tsx`).
- Ver `docs/context/tipo-producto-menu-toggle.md`.

## 🏢 Panel Superadmin — Trampas Críticas

- **`delivery_habilitado`** en `empresas` (DEFAULT `false`): activa el ítem "Zona de entrega" en el sidebar del admin (`requiresDelivery` flag). Controlable desde la columna "Globo envíos" de la tabla de empresas en superadmin. Si está en `false`, la ruta `/admin/delivery` NO aparece aunque la empresa sea restaurante o tienda.
- **`EmpresasTable`** extrae cada fila en `EmpresaTableRow` con su propio `useState(tipo)`. El `TipoSelector` llama `onTipoChange` solo cuando el PUT es OK — así Mesas/Pagos Mesa/Validación reaccionan al cambio de tipo SIN recargar la página.
- Mesas / Pagos Mesa / Validación solo se muestran para `tipo === 'restaurante'`. Las tiendas dejan esas celdas vacías.

## 📱 Service Worker PWA — Trampas Críticas

- `public/sw.js` es **plain JS**, no TypeScript. Vive en `/public`, no pasa por la compilación de Next.js.
- El SW solo se registra en **producción** (`SwRegistrar` verifica `process.env.NODE_ENV !== 'production'`). En dev no hay SW.
- **Scope** del SW: `{ scope: '/waiter' }` — solo intercepta requests de páginas bajo `/waiter/*`. Sin impacto en carta pública ni admin.
- **`/api/*` es NetworkOnly siempre** — nunca cachear auth ni datos de pedidos.
- **`navigator.onLine` guard obligatorio en `WaiterBanner`**: cuando el dispositivo está offline, `GET /api/waiter/me` lanza `TypeError: Failed to fetch`. Sin el guard, `.catch(() => setIsWaiter(false))` dispara el efecto de redirección a login, expulsando al camarero. El guard `if (!navigator.onLine) return` en el effect de redirect evita esto.
- **DevTools 0 bytes**: Chrome DevTools Cache Storage muestra `0 B` para respuestas gzip cacheadas. Es un bug de visualización — el contenido real está ahí (verificado con `arrayBuffer()`).
- **RSC prefetch**: Next.js App Router envía payloads `text/x-component` para navegación client-side. El guard `isWaiterHtml` (verifica `content-type` incluye `text/html`) los excluye correctamente del caché NetworkFirst.
- **SonarLint S7764 en sw.js**: usar `globalThis.skipWaiting()` y `globalThis.clients.claim()` en lugar de `self.*`.
- Para testear el SW: `pnpm build && pnpm start` (modo producción). Ver `docs/context/pwa-offline-system.md`.

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

## 📱 Capacitor Android PDA — Trampas Críticas

> Ver doc completo: `docs/context/capacitor-android-pda.md`

### Proceso de build — orden OBLIGATORIO
1. Editar `www/index.html` (fuente en el worktree, NUNCA editar `assets/public/` directamente)
2. `npx cap copy android` — copia `www/` a `android/app/src/main/assets/public/`. **Sin este paso, cualquier cambio en `www/index.html` se ignora silenciosamente.**
3. Bumping de `versionCode` en `android/app/build.gradle`
4. `KEYSTORE_PASSWORD=... KEY_PASSWORD=... ./gradlew assembleRelease`
5. Subir `waiter-{N}.apk` a Supabase Storage bucket `app-releases`
6. Actualizar defaults en `src/app/api/app/version/route.ts`

### Trampas de alto impacto
- **`SameSite=lax` obligatorio** en `waiter_token` cookie. Con `strict`, la WebView navegando de `capacitor://localhost` → `https://domain.com` nunca recibe el cookie → siempre muestra PIN.
- **`CookieManager.getInstance().flush()` en `onPause()`** — sin esto, el cookie se pierde si el proceso es killed → PIN en cada apertura.
- **`style.display = ''` NO muestra elementos** si hay un CSS rule `display:none`. Usar siempre `style.display = 'block'`.
- **`window.load` no `DOMContentLoaded`** — el bridge de Capacitor no está disponible en DOMContentLoaded.
- **`isNativePlatform()` no `isNative`** — API correcta en Capacitor 5+.
- **`/waiter/mesas` no existe** — la grilla de mesas vive en `/waiter`. No redirigir a rutas inexistentes.
- **`WaiterLoginForm` flash de PIN** — inicializa en `step="pin"`. Mostrar spinner mientras `isCheckingAuth=true` (hasta que `/api/waiter/me` resuelve).
- **`BuildConfig.DEFAULT_DOMAIN`** — fallback para el update check cuando el usuario borra datos. Requiere `buildFeatures { buildConfig = true }` en `build.gradle`.
- **Vercel env vars** `APP_VERSION` / `APP_VERSION_CODE` sobreescriben los defaults del código. Actualizar en Vercel al hacer release si están seteadas.
## 🖥 Electron TPV Windows — Trampas Críticas

> Ver `electron/main.ts` y `electron/preload.ts`.

- **Bundling con esbuild** — `electron/dist/main.js` y `electron/dist/preload.js` son bundles generados por esbuild. No editar los `.js` directamente; editar los `.ts` fuente y recompilar.
- **`electron/package.json` con `"type": "commonjs"`** — el proceso main de Electron necesita CJS. El `package.json` raíz tiene `"type": "module"`, por eso el sub-package tiene su propio `type`.
- **URL remota siempre** — el shell carga `https://{dominio}/tpv` desde producción. No hay Next.js local dentro de Electron.
- **IPC para impresión** — el renderer llama `window.electronAPI.print(data)` vía contextBridge. El main process recibe el IPC y llama a `node-thermal-printer`. Nunca acceder a módulos de Node directamente desde el renderer.
- **Auto-update endpoint** — `GET /api/app/version/latest.yml` sirve el archivo YAML para `electron-updater`. El endpoint está en `src/app/api/app/version/latest.yml/route.ts`.
- **`electron/dist/` en `.gitignore`** — los bundles compilados no se commitean. El proceso de build es: `pnpm build:electron:prep` (esbuild) → `pnpm build:electron:rebuild` (native modules) → `electron-builder --win`.

## 🧾 TPV Cobros — IVA/IGIC, Compliance y RGPD (Trampas Críticas)

> Ver doc completo: `docs/tpv-legal-compliance.md` y `docs/context/legal-compliance.md`

- **IVA/IGIC multi-rate**: `detalle_items[i].impuestoPorcentaje` DEBE estar presente al crear cobro. Sin él, el trigger usa `iva_porcentaje` global como fallback (comportamiento legacy). Resolver per-item con `resolveImpuestoPorcentaje(producto.porcentajeImpuestoOverride, empresa.porcentajeImpuesto)` (`src/lib/tpv/impuesto.ts`).
- **`desglose_iva` NULL en cobros históricos** — El printer (`browser-printer.ts`) tiene legacy fallback a línea única cuando `desgloseIva` es null. NO backfillable — el trigger de inmutabilidad bloquea UPDATEs en `tpv_cobros`.
- **Trigger `tpv_cobro_before_insert`** — itera `detalle_items`, agrupa por `ivaPorcentaje`, escribe `desglose_iva JSONB`. Si `detalle_items` está vacío o es NULL, usa path legacy (tasa única desde `iva_porcentaje`). SECURITY DEFINER con `search_path = public, extensions`.
- **`porcentaje_impuesto_override`** en `productos` — NULL significa "hereda de empresa". El campo en el ProductFormDialog envía `null` (no `0`) cuando se deja vacío. Distinción importante: `null` = heredar, `0` = exento.
- **`razon_social`** en `empresas` — campo legal para S.L./S.A. Nullable. Si presente, se imprime en el header del ticket en lugar de `nombre`. Distinto del nombre comercial.
- **RGPD anonimización**: `POST /api/admin/rgpd/anonimizar-cliente` — idempotente, requiere rol admin. Sustituye `nombre/email/telefono`; preserva `id` y relaciones con `pedidos`. Segunda llamada = no-op (200 sin cambios).
- **`ultima_actividad` en `clientes`** no avanza automáticamente — requiere trigger `trg_pedidos_ultima_actividad` en `pedidos`. Si el trigger falla o no existe, los clientes activos quedan con fecha de creación como base del auto-purge.
- **pg_cron auto-purge** — usa `INTERVAL '5 years'` (alineado con Art.66 LGT — obligación fiscal española). Si pg_cron no está habilitado en el proyecto Supabase, el job no existe pero las columnas sí. El endpoint manual es el único mecanismo en ese caso.
- **`resolveImpuestoPorcentaje` existe pero no se usa en el flujo principal** — es un helper disponible; el trigger resuelve server-side. Wire it up en `TpvCatalogProvider` o en el builder de `detalleItems` del cliente para pasar la tasa resuelta a la API.
- **`/tpv/legal` usa dual-auth** — la página SSR lee `admin_token` primero, luego `tpv_employee_token` como fallback. Redirige a `/tpv/login` (no `/admin/login`) si ninguno resuelve `empresaId`. Visible para TODOS los roles (incluyendo cajero) — solo contiene información de cumplimiento legal, no datos sensibles.

## 🗂 TPV Catalog Cache — Contexto Cliente + Offline

> Ver doc completo: `docs/context/tpv-catalog-cache.md`

- **`TpvCatalogProvider`** en `src/app/tpv/layout.tsx` — fetches en paralelo al montar (una vez por sesión). Persiste entre navegaciones client-side porque Next.js App Router no re-ejecuta layouts en tab switches.
- **Contexto:** `useTpvCatalog()` expone `products`, `categories`, `tipoImpuesto`, `porcentajeImpuesto`, `turno`, `setTurno`, `mesas`, `refreshMesas`, `refreshCatalog`.
- **Realtime debounced:** suscripción a `productos` + `categorias` → debounce 400ms → `GET /api/tpv/catalog`. Previene storm de requests en ediciones masivas del admin.
- **Turno zombi:** `TurnoCerrarForm` llama `setTurno(null)` antes de `router.push('/tpv/turno/abrir')`. Sin esto, el layout mantiene el turno anterior en memoria.
- **Redirect de turno en layout:** usa `x-pathname` (ya inyectado por proxy). `TURNO_OPTIONAL_PREFIXES = ['/tpv/turno', '/tpv/historial', '/tpv/analytics', '/tpv/mermas']`.
- **IndexedDB `tpv_catalog`:** separada de `tpv_offline`. Stores: `products`, `categories`, `config`. Snapshot único por store (`put()` sobreescribe — sin fantasmas por DELETEs). Ver `src/lib/tpv/tpv-catalog-db.ts`.
- **`useId()` para canales Realtime:** NO usar `Math.random()` en `useRef` — ESLint `react-hooks/purity` lo prohíbe. Usar `const instanceId = useId().replace(/:/g, '-')`.
- **Rules of Hooks:** guards `if (!turno) return null` van DESPUÉS de todos los hooks.
- **SW `/tpv/*`:** `public/sw-tpv.js`, scope `/tpv`. Estrategias: NetworkOnly para `/api/*`, CacheFirst para `/_next/static/`, NetworkFirst con fallback `/tpv/offline` para el resto.

## 🔑 TPV Empleados — Autenticación por PIN (Trampas Críticas)

> Ver doc completo: `docs/context/tpv-empleados-pin.md`

- **`pinHash` NUNCA en respuestas API** — las rutas `GET` y `POST` de `/api/admin/empleados-tpv` deben strippear `pinHash` antes de devolver. Usar `({ pinHash: _, ...rest }) => rest`. No agregar `pinHash` a DTOs de respuesta.
- **Dual-auth en proxy — orden importa** — el proxy prueba `admin_token` PRIMERO, luego `tpv_employee_token`. Agregar nuevas rutas TPV públicas a la lista explícita (`/tpv/login`, `/api/tpv/empleados/login`, `/api/tpv/empleados/logout`) en `proxy.ts`.
- **`admin_token` se borra al hacer login por PIN** — `/api/tpv/empleados/login` setea `admin_token='' maxAge=0` en la response. Sin esto, un `admin_token` previo de encargado/admin tiene prioridad sobre `tpv_employee_token` del cajero en layout SSR y páginas protegidas: el cajero heredaría el rol del admin y accedería a historial, analíticas y mermas. El layout lee `admin_token` PRIMERO; borrar el token en el login por PIN es la única forma de garantizar el aislamiento de rol.
- **Cajero tiene acceso restringido** — historial (`/tpv/historial`) y analíticas (`/tpv/analytics`) tienen guard SSR que redirige cajeros a `/tpv/mostrador`. Mermas (`/tpv/mermas`) es `'use client'` y usa `useTpvRol()` con `useRouter().replace('/tpv/mostrador')` en un `useEffect`. En `AccionesActions` y `TpvHeader` los links de estas secciones se ocultan para `isCajero`.
- **`/tpv/turno/espera`** — pantalla de espera para cajero sin turno activo. El CTA "Introducir PIN" lleva a `/tpv/login` (no a `/tpv/mostrador`, que crearía un loop).
- **`x-pathname` para bypass del layout TPV** — el proxy inyecta `x-pathname` en headers de página. El layout `src/app/tpv/layout.tsx` hace early return `<>{children}</>` cuando el path es `/tpv/login`. Sin este header, el layout bloquearía la página de login.
- **`user_id` nullable en `tpv_turnos`** — desde la migración `20260708000001`. Nunca asumir que `user_id` existe en un turno. Los turnos abiertos por empleado tienen `user_id = NULL` y `operador_id` apuntando a `empleados_tpv`.
- **Solo `encargado` puede abrir turno por PIN** — en `src/app/tpv/turno/abrir/page.tsx`, si el payload del token tiene `rol === 'cajero'`, se redirige a `/tpv/mostrador`. El cajero nunca ve la pantalla de abrir turno.
- **Cajero sin turno activo → loop infinito** — el layout redirige a `/tpv/turno/abrir` cuando no hay turno; esa página redirige cajeros de vuelta a `/tpv/mostrador`. El layout evita el loop enviando cajeros a `/tpv/turno/espera` en su lugar.
- **`csrf_token` obligatorio en login de empleado** — el proxy valida CSRF en todas las mutaciones TPV incluso con `tpv_employee_token`. El endpoint `/api/tpv/empleados/login` DEBE generar y setear `csrf_token` con `generateCsrfToken` + `signCsrfToken`. Sin esta cookie, cualquier POST posterior (abrir turno, cobro, etc.) devuelve 403.
- **`/tpv/login` no redirige por `admin_token`** — la página de login PIN solo auto-redirige encargados con token válido. Cajeros y admins siempre ven el formulario para poder re-autenticarse con otro rol.
- **Sliding window lazy** — el token `tpv_employee_token` NO se renueva en cada request (sin Redis en Vercel). Solo se renueva cuando quedan <15 min de vida, y en ese momento el proxy consulta la DB para verificar `activo = true`. Si el empleado está desactivado en ese momento, el token expira sin renovarse (gap máximo ≤1h).
- **Arqueo ciego para cajero** — `isBlindClose = (rol === 'cajero')`. La diferencia entre contado y teórico se calcula SERVER-SIDE en `/api/tpv/turno/[id]/cerrar`. `TurnoCerrarForm` con `isBlindClose=true` oculta totales teóricos y diferencia — no enviarlos desde el cliente no es suficiente (el server los calcula).
- **`tpv_employee_token` audience** — el JWT usa audience `'tpv-employee'`. No confundir con el `admin_token` que no tiene audience explícita. `verifyTpvEmployeeToken` en `src/lib/tpv-employee-auth.ts` valida esta audience; si falla silenciosamente, comprobar que el token se generó con `signTpvEmployeeToken`, no con `authAdminUseCase`.
- **CSRF requerido** — el proxy aplica validación CSRF también a requests de `tpv_employee_token`. El cliente debe usar `fetchWithCsrf` en todas las mutaciones del TPV.

## 🖥 TPV Mostrador — Trampas Críticas

- **`visibilitychange` refresh** — `MostradorClient` escucha `document.visibilitychange` y llama `handleRefresh()` cuando la pestaña vuelve a estar visible. Garantiza datos frescos al volver desde Waiter (otra pestaña o ventana) sin depender del realtime.
- **Re-fetch en mount** — un `useEffect([], [])` dispara `handleRefresh()` al montar para limpiar cualquier dato stale del Router Cache de Next.js al volver de `/tpv/cobro`.
- **Realtime dual: broadcast + postgres_changes** — `MostradorClient` usa dos capas: (1) broadcasts `new-order` e `item-update` para actualización rápida (asíncronos, pueden llegar antes del commit); (2) `postgres_changes` en `pedidos` filtrado por `sesion_id` para la cancelación de pedidos, que necesita esperar al commit para que el trigger `trg_auto_cancel_pedido` haya corrido.
- **`externalCobro` banner** — cuando `mesa_sesiones.cerrada_at` se actualiza desde otro canal (cobro externo), `MostradorClient` muestra un banner verde y llama `clearMesa()`. El banner se cierra manualmente.
- **`isSesionPagada` sync** — cuando `mesa_sesiones.sesion_pagada` cambia a `true` vía realtime, `MostradorClient` actualiza `isSesionPagada` sin recargar. `TicketPanel` usa ese estado para bloquear acciones de cobro.

## 🧾 TPV Cierre de Turno — Trampas Críticas

- **"Mesas sin cobrar" no bloquea cuando todas las órdenes están canceladas** — tanto la página SSR `/tpv/turno/cerrar` como el API guard `POST /api/tpv/turno/[id]/cerrar` hacen un segundo query a `pedidos` para verificar que las sesiones abiertas (`cerrada_at IS NULL`) tengan al menos un pedido activo (`neq estado cerrado/cancelado`). Las sesiones donde todas las órdenes se cancelaron no bloquean el cierre.
- **`get_mesas_with_sessions` RPC excluye pedidos cancelados** del `session_total` y del `activeOrderCount`. Si el badge de la mesa grid muestra pedidos o importes incorrectos tras cancelaciones masivas, revisar la migración `20260721000001` y el RPC en Supabase.
- **`countBySesion` en `supabase-mesa.repository.ts`** — excluye `estado='cerrado'` Y `estado='cancelado'`. Sin ambos filtros, los pedidos cancelados inflan el badge de pedidos activos en el grid de mesas.

## 🧩 Sistema de Complementos por Producto — Trampas Críticas

> Ver doc completo: `docs/context/complementos-system.md`

- **Dos sistemas coexisten**: el legacy (`categoria_complemento_de` en `categorias`) y el nuevo (tablas `complemento_grupos` / `complemento_opciones` / `producto_complemento_grupos`). No eliminar el legacy — backward compat obligatoria.
- **`getEffectiveGroups()`** en `QuantitySelectorDialog` y `MenuPanel.tsx` prioriza el nuevo sistema (`complementGroups`) y adapta el legacy al mismo formato `ComplementGroupVM` si no hay grupos nuevos.
- **Opciones del nuevo sistema no son `producto_id`** — `pedido.use-case.ts` las salta en la validación de precio server-side. No mezclar ids de opciones con ids de productos.
- **`setProductoGrupos` es destructiva**: `PUT /api/admin/productos/[productoId]/complementos` reemplaza TODOS los grupos. El cliente envía la lista completa, no un delta.
- **NO llamar `revalidateTag`** en `/api/admin/productos/[productoId]/complementos` — no tiene `unstable_cache`. Fue la causa del TypeError en MostradorClient al cargar el TPV.
- **`selectedComplements` en `PendingItem`**: `{ id, name, price }[]`. Se serializa como `{ nombre, precio }` en `detalle_pedido[i].complementos` al crear pedido.
- **Admin gestión**: `/admin/complementos` — crear/editar grupos globales del tenant. Asignación por producto en el tab "Complementos" de `ProductFormDialog`.

## 🥜 Sistema de Alérgenos — Trampas Críticas

> Ver doc completo: `docs/context/alergenos-system.md`

- **14 alérgenos EU fijos** (Reglamento 1169/2011 Anexo II) — columna `productos.alergenos text[] NOT NULL DEFAULT '{}'`. Zod valida con `z.enum([...14 códigos...])` server-side; códigos inválidos son rechazados.
- **`mapUpdateProductPayload` tiene allowlist explícita** en `SupabaseProductRepository` (~línea 183). `'alergenos'` está en la lista — si se añaden más campos a `Product` en el futuro, deben agregarse aquí o se descartan silenciosamente.
- **No requiere endpoint separado** — los alérgenos son parte del payload del PATCH de producto. A diferencia de `complementos`, no hay PUT independiente.
- **`AllergenSelector.language` es `string`, no `Language`** — cast interno a `Parameters<typeof t>[1]`. No usar `Language` en ese prop para no crear acoplamiento cruzado entre módulos.
- **Iconos en `src/components/allergen-icons.tsx`**: `AllergenBadges` (cards del menú, solo iconos), `AllergenList` (dialog de detalle, icono + nombre). Ambos devuelven `null` cuando `alergenos` está vacío — sin render, sin elementos vacíos.
- **`allergenDairy` y `allergenTreeNuts`** son claves de traducción legacy (existían antes de este cambio). No confundir con los códigos de DB `'milk'` y `'nuts'`. Las claves legacy NO se eliminan — backward compat.
- **Los alérgenos NO viajan al pipeline de cocina/bar** — son informativos para el cliente en la carta pública. `pedidos.detalle_pedido` no incluye alérgenos.

## 🔭 Sentry — Monitoring y Observabilidad

> Ver doc completo: `docs/context/sentry-monitoring.md`

- **Dos capas coexisten**: Supabase `log_errors` (errores de negocio con contexto de tenant) + Sentry (errores técnicos, client-side, performance). No eliminar ninguna.
- **`instrumentation.ts` NO es per-request** — `register()` corre una sola vez al arrancar el servidor. El contexto de tenant (`empresa_id`) se inyecta en `layout.tsx` (server) + `SentryProvider` (client).
- **NO agregar `Sentry.captureException()` en `error.tsx` / `global-error.tsx` / `tpv/error.tsx`** — `withSentryConfig` los instrumenta automáticamente. Agregarlo manualmente duplica eventos en el dashboard.
- **`maskAllText: true` + `blockAllMedia: true` obligatorios** en Session Replay — el TPV y la carta manejan datos de clientes de los tenants.
- **Double-channel**: `ErrorLogger.logError()` escribe en Supabase Y llama `Sentry.captureException()` (server-side, con guard `globalThis.window === undefined`). `logClientError()` llama Sentry directamente (client-side).
- **CSP**: `https://*.sentry.io` está en `connect-src` en `next.config.mjs` (fallback) Y en `src/proxy.ts` (nonce-based). Si se agrega un dominio CSP nuevo, revisar ambos archivos.
- **Quota free tier**: errores 5k/mes, transacciones 10k/mes. Si se alcanza, reducir `tracesSampleRate` de `1.0` a `0.1` en `sentry.client.config.ts`, `sentry.server.config.ts` y `sentry.edge.config.ts`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
