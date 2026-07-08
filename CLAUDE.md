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

1. **React StrictMode double-mount con canal de nombre fijo** → el cleanup del primer mount cierra el canal; el segundo mount recibe un canal ya cerrado y nunca escucha. **Fix:** usar `useRef` con sufijo aleatorio: `useRef(\`waiter-banner-\${Math.random().toString(36).slice(2)}\`)` y pasar ese ref como nombre de canal.

2. **`postgres_changes` silenciado en cliente singleton** → Supabase JS comparte una única conexión WebSocket. Varios componentes suscribiendo al mismo tabla desde distintos canales pueden dejar de recibir eventos. **Fix híbrido:** el componente central (`WaiterBanner`) escucha `postgres_changes` y además dispara un `CustomEvent('waiter-realtime-update')` por DOM, que los demás componentes capturan como fallback.

3. **Race condition en validate loop** → cuando pendientes valida múltiples pedidos secuencialmente, el trigger de DB lanza un broadcast después de cada PATCH. El relay DOM llama `fetchPendientes()` entre iteraciones y devuelve estado parcial (el segundo pedido sigue en `pendiente_validacion`). **Fix:** `confirmingRef` (mirror de `useRef` del estado `confirming`); el relay retorna temprano si `confirmingRef.current.size > 0`. El `finally` del loop hace el fetch autoritativo.

4. **Mesa grid badge no se actualiza al marcar ítems en cocina** → la cocina modifica `pedido_item_estados`, que no toca `mesa_sesiones`. `WaiterLoginForm` sólo escuchaba `mesa_sesiones`. **Fix:** agregar suscripción al broadcast `waiter-items-update` (canal `'waiter-items-update'`, evento `'item-update'`).

### Arquitectura de canales activa

| Canal | Tipo | Tabla/evento | Quién escucha |
|---|---|---|---|
| `waiter-banner-{uid}` | postgres_changes | pedidos, pedido_item_estados, mesa_sesiones | WaiterBanner |
| `waiter-new-order` | broadcast `new-order` | trigger notify_waiter_new_order (todos los INSERTs) | WaiterBanner |
| `waiter-new-order-kitchen` | broadcast `new-order` | trigger notify_waiter_new_order | WaiterKitchenPage |
| `waiter-new-order-bar` | broadcast `new-order` | trigger notify_waiter_new_order | BarPage |
| `waiter-items-update` | broadcast `item-update` | trigger notify_waiter_items_update | WaiterBanner, BarPage, WaiterLoginForm |
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
- **`pedidos.estado` NUNCA se actualiza** por cocina/bar al marcar ítems. La source of truth real está en `pedido_item_estados`. La route `/api/mesas/[mesaId]/orders` sintetiza el estado efectivo de cada pedido comparando item-level estados (`listo`/`servido`/`cancelado`). NO leer `pedido.estado` directamente para saber si un pedido está servido.
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

## 🍽 Sistema Tipo Producto (Restaurante)

- **`categorias.tipo_producto`** (`'comida'|'bebida'`, DEFAULT `'comida'`) es la fuente de verdad para el enrutado cocina/bar. NO leer `productos.tipo_producto` para determinar el tab del menú.
- Cambiar el tipo de una categoría actualiza en cascada todos sus productos (`SupabaseCategoryRepository.update`).
- Crear un producto con `categoria_id` → el repositorio hereda el tipo de la categoría automáticamente.
- El toggle Comida/Bebidas del menú público (`getCategoryTab`) lee `cat.tipoProducto` directamente; ya no infiere desde los items.
- Subcategorías sin productos no se renderizan (`menu-section.tsx`).
- Ver `docs/tipo-producto-menu-toggle.md`.

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

## 🔑 TPV Empleados — Autenticación por PIN (Trampas Críticas)

> Ver doc completo: `docs/context/tpv-empleados-pin.md`

- **`pinHash` NUNCA en respuestas API** — las rutas `GET` y `POST` de `/api/admin/empleados-tpv` deben strippear `pinHash` antes de devolver. Usar `({ pinHash: _, ...rest }) => rest`. No agregar `pinHash` a DTOs de respuesta.
- **Dual-auth en proxy — orden importa** — el proxy prueba `admin_token` PRIMERO, luego `tpv_employee_token`. Agregar nuevas rutas TPV públicas a la lista explícita (`/tpv/login`, `/api/tpv/empleados/login`, `/api/tpv/empleados/logout`) en `proxy.ts`.
- **`x-pathname` para bypass del layout TPV** — el proxy inyecta `x-pathname` en headers de página. El layout `src/app/tpv/layout.tsx` hace early return `<>{children}</>` cuando el path es `/tpv/login`. Sin este header, el layout bloquearía la página de login.
- **`user_id` nullable en `tpv_turnos`** — desde la migración `20260708000001`. Nunca asumir que `user_id` existe en un turno. Los turnos abiertos por empleado tienen `user_id = NULL` y `operador_id` apuntando a `empleados_tpv`.
- **Solo `encargado` puede abrir turno por PIN** — en `src/app/tpv/turno/abrir/page.tsx`, si el payload del token tiene `rol === 'cajero'`, se redirige a `/tpv/mostrador`. El cajero nunca ve la pantalla de abrir turno.
- **Sliding window lazy** — el token `tpv_employee_token` NO se renueva en cada request (sin Redis en Vercel). Solo se renueva cuando quedan <15 min de vida, y en ese momento el proxy consulta la DB para verificar `activo = true`. Si el empleado está desactivado en ese momento, el token expira sin renovarse (gap máximo ≤1h).
- **Arqueo ciego para cajero** — `isBlindClose = (rol === 'cajero')`. La diferencia entre contado y teórico se calcula SERVER-SIDE en `/api/tpv/turno/[id]/cerrar`. `TurnoCerrarForm` con `isBlindClose=true` oculta totales teóricos y diferencia — no enviarlos desde el cliente no es suficiente (el server los calcula).
- **`tpv_employee_token` audience** — el JWT usa audience `'tpv-employee'`. No confundir con el `admin_token` que no tiene audience explícita. `verifyTpvEmployeeToken` en `src/lib/tpv-employee-auth.ts` valida esta audience; si falla silenciosamente, comprobar que el token se generó con `signTpvEmployeeToken`, no con `authAdminUseCase`.
- **CSRF requerido** — el proxy aplica validación CSRF también a requests de `tpv_employee_token`. El cliente debe usar `fetchWithCsrf` en todas las mutaciones del TPV.
