# CLAUDE.md - Contexto multi_shop

## REGLA DE ORO (Post-cambio obligatorio)
Tras CADA modificacion: `pnpm lint && pnpm build`. No marcar tarea como completada si fallan.

## SonarLint — Reglas activas (aplicar siempre)

- **S3776** — Complejidad cognitiva <= 15. Extraer bloques `if/else` complejos y ternarios a funciones puras de modulo.
- **S2004** — Max 4 niveles anidados. Predicados de `.filter()` → funcion de modulo. Callbacks con fetch+setState → `useCallback` propio.
- **S3358** — Prohibido ternario anidado. Usar funcion de modulo con `if/return`.
- **S4325** — No casts redundantes. Tras `'prop' in unionValue`, TypeScript ya estrecha el tipo.
- **S6759** — Props siempre `Readonly<Props>`: `function Cmp({ ... }: Readonly<Props>) {}`.
- **S7735** — Condiciones en positivo: `x === null ? B : A` (no `x !== null ? A : B`).
- **S6819/S6848** — HTML semantico: `<button type="button">` no `<div role="button">`. Backdrop = `<button>`.
- **Lang type**: `type Lang = Parameters<typeof t>[1]` en helpers que usan `t()`.

## Arquitectura y Capas
Clean Architecture: `API Route (Zod) → Use Case (Logic) → Repository (Infra)`.
- **Domain (`core/domain/`):** Entidades (types.ts), interfaces y constantes.
- **Application (`core/application/`):** DTOs (Zod) y Use Cases.
- **Infrastructure (`core/infrastructure/`):** Implementaciones de Repos, Singletons (Supabase/S3), API helpers.

**Reglas de Flujo:**
1. NUNCA acceder a DB desde routes/pages. Siempre via Use Case.
2. NUNCA `createClient()` manual. Usar `getSupabaseClient()` o `getSupabaseAnonClient()`.
3. NUNCA usar `any`. Usar `Record<string, unknown>` o tipos de dominio.
4. **Mappers:** Repos devuelven CamelCase. API responde con snake_case si el cliente lo requiere.

## Patron Result<T, E> y Errores
Todo el codebase usa `Result<T, AppError>`.
- **Repo:** Captura error → `logger.logAndReturnError` → retorna `{ success: false, error }`.
- **API:** Usa `handleResult(result)` para mapear automaticamente a status HTTP (400, 401, 404, 500).
- **Codigos:** Centralizados en `core/domain/constants/api-errors.ts`.

## Seguridad (Checklist Critico)
- **Auth:** JWT en cookies HttpOnly. Verificacion en `proxy.ts` (API) y `authAdminUseCase` (SSR).
- **RBAC:** Mutaciones en `/api/admin/*` requieren `requireRole(request, ['admin', 'superadmin'])`.
- **Zod:** `safeParse` OBLIGATORIO + `max()` en todos los strings + `try/catch` en `request.json()`.
- **PII:** Prohibido loguear emails/telefonos. Usar datos anonimizados.
- **Secrets:** Lectura lazy via funciones (ej: `getTokenSecret()`), nunca constantes de modulo.
- **CSRF:** Validado en proxy para metodos mutativos de admin.

## Base de Datos (Trampas Comunes)
- `pedidos`: NO tiene columna `telefono` (esta en `clientes`).
- `productos`: Campos i18n (`titulo_es`, `titulo_en`, etc.).
- `tenant`: Siempre derivar empresa via `parseMainDomain(domain)`.
- `superadmin`: `empresaId` es null. Se pasa por query param `?empresaId=...`.

## Migraciones — Checklist Obligatorio por Tabla Nueva

Toda migracion que cree una tabla nueva DEBE incluir estos tres bloques, en este orden:

### 1. RLS
```sql
ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to mi_tabla"
  ON public.mi_tabla FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve mi_tabla"
  ON public.mi_tabla FOR SELECT
  USING (empresa_id = get_mi_empresa_id());
-- ... INSERT / UPDATE / DELETE con mismo patron
```

### 2. GRANTs explícitos (obligatorio desde oct 2026 — Supabase Data API)
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO authenticated;
-- GRANT SELECT ON public.mi_tabla TO anon;  <- solo si tabla publica
```

### 3. Funcion auxiliar de aislamiento de tenant
`get_mi_empresa_id()` — definida en `20260527000002_create_get_mi_empresa_id.sql`.
Retorna el `empresa_id` del admin autenticado via `auth.uid()` → `perfiles_admin`.
Usar siempre en RLS policies para aislar datos por empresa.

## UI & Design System (Tailwind v4)
- **Tokens:** NUNCA hardcodear colores. Usar variables CSS del tenant.
- **Accesibilidad:** Touch targets min 44px. Focus rings estandar. `aria-labels` traducidos.
- **I18n:** Usar `t()` de `@/lib/translations` para TODO el texto de UI.
- **Imagenes:** Usar `ImageUploader` (auto-optimiza WebP). `object-contain` por defecto.

## Comandos Utiles
- Dev: `pnpm dev`
- Build: `pnpm build` (Ignorar "Skipping validation of types")
- Lint: `pnpm lint`

## Realtime — Patrones Criticos (Waiter System)

> Ver doc completo: `docs/context/realtime-channels.md`

- **StrictMode double-mount**: sufijo de instancia con `useId()`, NO con `Math.random()` (ESLint `react-hooks/purity` lo prohibe). Broadcast channels de nombre fijo: guard async (`if (!waiterEmpresaId) return`).
- **WebSocket singleton**: multiples `postgres_changes` en la misma tabla pueden silenciarse. `WaiterBanner` escucha centralmente y dispara `CustomEvent('waiter-realtime-update')` como fallback DOM.
- **Race en validate loop**: `confirmingRef` como mirror del estado. Relay retorna temprano si `confirmingRef.current.size > 0`.
- **Broadcast llega antes del commit**: para eventos transaccionales (auto-cancel), usar `postgres_changes` no broadcast.

## WaiterBanner — Re-autenticacion sin recarga

`WaiterLoginForm.handlePinSubmit` dispara `window.dispatchEvent(new CustomEvent('waiter-auth-changed'))` al hacer login. `WaiterBanner` escucha ese evento y re-llama `/api/waiter/me`.

## Sistema de Camarero — Trampas Criticas

> Ver doc completo: `docs/context/waiter-panel.md`

- **Rutas `/api/mesas/*`** NO reciben `x-empresa-id` del proxy. Derivar empresa por dominio: `getDomainFromHeaders()` → `parseMainDomain()` → `findByDomain()`.
- **`pedidos.estado` NUNCA se actualiza** por cocina/bar. Source of truth = `pedido_item_estados`. Ciclo: `pendiente_validacion` → `pendiente` → `cancelado` (trigger) → `cerrado` (cobro).
- **`from_validation`** en `pedido_item_estados`: `false` = retenido en cocina; `true` = devuelto a pendientes. Nunca mezclar.
- **Pausa prevalece sobre seleccion** en `handleConfirmBoth`. Item puede estar seleccionado Y pausado → va a `pausedIndices`. NO filtrar con `&& !selected.has(...)`.
- **`validated_at`**: timer de cocina/bar cuenta desde validacion (`validated_at ?? created_at`), no desde creacion.
- **`WaiterBanner`** renderiza en TODAS las paginas. Sonido `bell.mp3` solo con guard `pathname.startsWith('/waiter')`.

## Sistema de Stock & Mermas — Trampas Criticas

> Ver doc completo: `docs/context/stock-system.md`

- **Columna es `activo`**, no `disponible`.
- **`detalle_pedido[item_idx].producto_id`** debe estar siempre presente al crear pedidos — sin el, el trigger de stock salta silenciosamente.
- **`replaceReceta`** es destructiva — PUT borra y reinserta. Enviar lista COMPLETA.
- **`/api/admin/stock/ingredientes`** exige rol admin/superadmin. Desde contexto TPV usar `/api/tpv/stock/ingredientes`.

## Sistema Tipo Producto (Restaurante)

> Ver doc completo: `docs/context/tipo-producto-menu-toggle.md`

- **`categorias.tipo_producto`** es la fuente de verdad para enrutado cocina/bar. NO leer `productos.tipo_producto`.
- Cambiar tipo de categoria actualiza en cascada todos sus productos.

## Panel Superadmin — Trampas Criticas

- **`delivery_habilitado`** en `empresas` (DEFAULT `false`): activa "Zona de entrega" en sidebar. Controlable desde superadmin.
- Mesas / Pagos Mesa / Validacion solo se muestran para `tipo === 'restaurante'`.

## Service Worker PWA — Trampas Criticas

> Ver doc completo: `docs/context/pwa-offline-system.md`

- `public/sw.js` es plain JS, scope `/waiter`. Solo se registra en produccion.
- **`navigator.onLine` guard obligatorio** en `WaiterBanner` — sin el, un `Failed to fetch` offline expulsa al camarero.
- **`/api/*` es NetworkOnly siempre** — nunca cachear auth ni datos de pedidos.

## SEO Multi-Tenant

> Ver doc completo: `docs/context/seo-multitenant.md`

- Archivos clave: `layout.tsx`, `robots.ts`, `sitemap.ts`, `not-found.tsx`, `json-ld.tsx`.
- Coordenadas geo se parsean desde `empresa.url_mapa` (Google Maps URL).

## Capacitor Android PDA — Trampas Criticas

> Ver doc completo: `docs/context/capacitor-android-pda.md`

- **`SameSite=lax` obligatorio** en `waiter_token` — con `strict`, la WebView nunca recibe la cookie.
- **`npx cap copy android`** obligatorio tras editar `www/index.html` — sin este paso los cambios se ignoran silenciosamente.
- **`window.load` no `DOMContentLoaded`** — el bridge de Capacitor no esta disponible en DOMContentLoaded.

## Electron TPV Windows — Trampas Criticas

> Ver doc completo: `docs/context/electron-tpv.md`

- Editar `.ts` fuente, nunca los `.js` en `electron/dist/` (son bundles esbuild).
- **IPC para impresion**: renderer → `window.electronAPI.print(data)` → main → `node-thermal-printer`. Nunca acceder a Node desde el renderer.

## TPV Cobros — IVA/IGIC, Compliance y RGPD

> Ver doc completo: `docs/tpv-legal-compliance.md` y `docs/context/legal-compliance.md`

- **`detalle_items[i].impuestoPorcentaje`** DEBE estar presente. Sin el, el trigger usa la tasa global como fallback legacy.
- **`porcentaje_impuesto_override` NULL** = hereda de empresa. `0` = exento. No confundir.
- **`pedidos` DELETE bloqueado** — trigger `pedidos_no_delete` (migracion `20260722000002`). Art.66 LGT — retencion fiscal minima 5 anos.
- **RGPD purge**: Vercel Cron mensual (dia 1, 03:00 UTC). `CRON_SECRET` requerido. pg_cron NO disponible en plan Free de Supabase.

## TPV Catalog Cache — Contexto Cliente + Offline

> Ver doc completo: `docs/context/tpv-catalog-cache.md`

- **`useId()` para canales Realtime** — NO `Math.random()` en `useRef` (ESLint `react-hooks/purity`).
- **Rules of Hooks**: guards `if (!turno) return null` van DESPUES de todos los hooks.
- **Turno zombi**: `TurnoCerrarForm` llama `setTurno(null)` ANTES de `router.push('/tpv/turno/abrir')`.

## TPV Empleados — Autenticacion por PIN

> Ver doc completo: `docs/context/tpv-empleados-pin.md`

- **`pinHash` NUNCA en respuestas API** — strippear siempre con `({ pinHash: _, ...rest }) => rest`.
- **`admin_token` se borra al hacer login por PIN** — sin esto, el cajero hereda el rol del admin.
- **`csrf_token` obligatorio** — `/api/tpv/empleados/login` DEBE setear `csrf_token`. Sin el, todos los POSTs posteriores devuelven 403.
- **Cajero sin turno** → redirigir a `/tpv/turno/espera`, NO a `/tpv/mostrador` (loop infinito).
- **Dual-auth orden**: `admin_token` PRIMERO, luego `tpv_employee_token`.

## TPV Mostrador — Trampas Criticas

- **`visibilitychange` refresh** — `MostradorClient` llama `handleRefresh()` al volver visible la pestana.
- **Realtime dual**: broadcasts para velocidad, `postgres_changes` en `pedidos` para auto-cancel (transaccional, llega post-commit).
- **`externalCobro` banner** — `mesa_sesiones.cerrada_at` actualizado externamente → banner verde + `clearMesa()` manual.

## TPV Cierre de Turno — Trampas Criticas

- **Sesiones con todas las ordenes canceladas NO bloquean cierre** — el guard verifica pedidos activos, no sesiones abiertas.
- **`countBySesion`** excluye `estado='cerrado'` Y `estado='cancelado'` — sin ambos, los cancelados inflan el badge.

## Sistema de Complementos por Producto

> Ver doc completo: `docs/context/complementos-system.md`

- **Dos sistemas coexisten**: legacy (`categoria_complemento_de`) y nuevo (`complemento_grupos` / `complemento_opciones`). No eliminar el legacy.
- **`setProductoGrupos`** es destructiva — PUT reemplaza TODOS los grupos. Enviar lista COMPLETA.
- **NO llamar `revalidateTag`** en `/api/admin/productos/[productoId]/complementos` — no tiene `unstable_cache`.

## Sistema de Alergenos

> Ver doc completo: `docs/context/alergenos-system.md`

- **`mapUpdateProductPayload`** tiene allowlist explicita en `SupabaseProductRepository`. Nuevos campos de `Product` deben agregarse ahi o se descartan silenciosamente.
- **`allergenDairy` y `allergenTreeNuts`** son claves de traduccion legacy — NO eliminar.

## Sentry — Monitoring y Observabilidad

> Ver doc completo: `docs/context/sentry-monitoring.md`

- **NO agregar `Sentry.captureException()`** en `error.tsx` / `global-error.tsx` / `tpv/error.tsx` — `withSentryConfig` los instrumenta automaticamente. Agregarlo duplica eventos.
- **CSP**: `https://*.sentry.io` en `next.config.mjs` (fallback) Y en `src/proxy.ts` (nonce-based). Revisar AMBOS al agregar dominios.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
