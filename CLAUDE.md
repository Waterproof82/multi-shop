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
- **CSRF:** Validado en proxy para metodos mutativos de admin, waiter y kitchen (`handleWaiterAuth`). Mismo patron double-submit cookie+header con `timingSafeEqual`.
- **REVOKE SECURITY DEFINER (CRITICO):** Toda funcion `SECURITY DEFINER` nueva DEBE incluir estos tres REVOKEs inmediatamente despues del `CREATE OR REPLACE`:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.mi_funcion() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.mi_funcion() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.mi_funcion() FROM authenticated;
  GRANT  EXECUTE ON FUNCTION public.mi_funcion() TO service_role;
  ```
  Sin esto, la funcion queda expuesta en `/rest/v1/rpc/mi_funcion` para cualquier usuario anonimo.
  Excepcion unica: `get_mi_empresa_id()` necesita EXECUTE en `authenticated` para las RLS policies.
  El test `e2e/compliance/supabase-security-definer.spec.ts` verifica esto automaticamente en CI.
- **Particiones RLS:** Las tablas de particion NO heredan RLS del padre. Cada particion nueva necesita `ENABLE ROW LEVEL SECURITY` + policies propias. `lc_create_next_partition()` lo hace automaticamente.
- **delete-all en produccion:** `DELETE /api/admin/pedidos/delete-all` tiene guard `NODE_ENV === 'production'` → 403. Nunca eliminar ese guard.
- **`pedidos.es_prueba` (CRITICO):** unica excepcion al bloqueo de DELETE del Art.66 LGT. `pedidos_block_delete` solo deja borrar filas con `es_prueba = true` y sin cobros asociados, y registra cada borrado en `pedidos_prueba_purga_log` (solo insercion).
  - El flag es **inmutable**: el trigger `pedidos_es_prueba_inmutable` bloquea cualquier UPDATE sobre esa columna. Sin eso, marcar un pedido facturado como prueba y borrarlo seria una puerta trasera al registro fiscal.
  - **NUNCA exponer `es_prueba` en un DTO de Zod ni en un mapper de repositorio.** Si el cliente pudiera activarlo, seria un vector para sacar ingresos de los totales fiscales. Solo se fija en el INSERT con service_role (tests E2E).
  - Los pedidos con el flag quedan excluidos de `get_pedido_stats_ano`. Purga en lote: `SELECT purge_pedidos_prueba(empresa_id)`.
  - El test `e2e/compliance/pedidos-borrado-pruebas.spec.ts` verifica las barreras en CI.
- **Tests E2E que insertan pedidos:** deben poner `es_prueba: true` en el INSERT y borrarlos en el teardown. Sin el flag las filas son imborrables y se acumulan en la tabla con retencion fiscal, inflando los conteos del dashboard (paso de verdad: 200 filas acumuladas duplicaban el numero de pedidos de julio 2026).
- **E2E tests de seguridad:** `e2e/waiter-csrf.spec.ts` cubre CSRF + RLS. Ejecutar con `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/`.

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

-- AS RESTRICTIVE, no PERMISSIVE (default): una policy RESTRICTIVE se combina
-- con AND, así que ninguna policy permisiva añadida despues (por descuido o
-- para Realtime) puede anularla. Este fue el bug raiz del incidente RLS del
-- 2026-07-31 — ver docs/context/security.md.
CREATE POLICY "No direct anon access to mi_tabla"
  ON public.mi_tabla AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- TO authenticated explicito, NUNCA omitido (el default es `public`, que
-- incluye anon). Con TO public + una llamada a get_mi_empresa_id() (funcion
-- solo ejecutable por authenticated), anon puede volverse elegible para
-- evaluar la policy y Postgres lanza "permission denied" en vez de negar
-- limpiamente. Mismo incidente del 2026-07-31.
CREATE POLICY "Admin ve mi_tabla"
  ON public.mi_tabla FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());
-- ... INSERT / UPDATE / DELETE con mismo patron (TO authenticated, WITH CHECK explicito en INSERT)
```

**InitPlan — envolver SIEMPRE `auth.uid()` en `(SELECT ...)`:**
Dentro de un `EXISTS` correlacionado (o de cualquier qual que el planificador no pueda
promover), `auth.uid()` se evalua UNA VEZ POR FILA. Envuelta, Postgres la convierte en
InitPlan y la evalua una sola vez para todo el plan:
```sql
-- MAL:  pa.id = auth.uid()
-- BIEN: pa.id = (SELECT auth.uid())
```
Aplica igual a `get_mi_empresa_id()`, que ademas consulta `perfiles_admin` en cada
evaluacion. Ojo: el advisor `auth_rls_initplan` de Supabase NO detecta las funciones
envoltorio — solo matchea `auth.<fn>()` literal, asi que `get_mi_empresa_id()` sin
envolver pasa desapercibida. El smoke test (seccion 7 de `smoke-db-functions.sql`)
verifica el caso de `auth.uid()` en CI.

**Si la policy la genera una funcion** (p. ej. `lc_create_next_partition()` crea las
policies de cada particion nueva desde el cron): corregir el GENERADOR, no solo las
policies existentes. Si no, el defecto vuelve solo cada mes.

### 2. GRANTs explícitos (obligatorio desde oct 2026 — Supabase Data API, y ahora tambien a nivel de DB)
Desde el 2026-07-31, `public` ya NO otorga privilegios por defecto a `anon`/`authenticated` en tablas nuevas (`ALTER DEFAULT PRIVILEGES` revocado — ver `security.md`). Esto ya no es solo una buena práctica: sin este bloque, la tabla es **completamente inaccesible** para `authenticated`/`anon`, incluso con RLS bien configurado.
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

## Imagenes — Trampas Criticas

> Ver doc completo: `docs/context/imagenes.md`

- **NUNCA `import Image from 'next/image'` para pintar salida de `ImageUploader`.** Usar `ImagenSubida` (`src/components/ui/imagen-subida.tsx`).
  `optimizeImage()` ya reescala a **480x480 WebP q0.8** antes de subir. `next/image` con `sizes` en `vw` pide los 8 anchos de dispositivo por defecto (640-3840), **todos MAYORES que el original**: 8 transformaciones facturadas por foto para producir 8 imagenes peores. Con 38 fotos, una sola carga en frio = ~300 transformaciones (aviso de Vercel al 75% de 5.000, agosto 2026).
- **No hace falta trafico real para gastarlas**: basta un bot rastreando (`robots.ts` permite `/`), que expire la cache de imagen (4 h en Next 16) o un dia de muchos despliegues.
- **Se pierde en silencio**: el autocompletado ofrece `next/image` primero, y reintroducirlo no rompe nada visible — solo la factura. Lo cubre `tests/compliance/imagenes-sin-doble-optimizacion.test.ts` (29 casos). **Si creas una pantalla nueva que pinta subidas, anadela a esa lista.**
- **Excepcion**: imagenes que NO pasan por `ImageUploader` (terceros, APIs externas, originales grandes) si deben usar `next/image` normal.
- El banner se pinta como `backgroundImage` en CSS (`hero-banner.tsx`), no con `next/image` — no aplica.

## Comandos Utiles
- Dev: `pnpm dev`
- Build: `pnpm build` (Ignorar "Skipping validation of types")
- Lint: `pnpm lint`
- **DB Smoke (OBLIGATORIO tras cada migracion):** `pnpm db:smoke`
- E2E DB smoke (con Playwright): `pnpm e2e:db`
- E2E completo: `pnpm e2e`

## Tests — Checklist Post-Migracion (OBLIGATORIO)

Tras CADA `supabase db push` o `supabase migration up`:
1. `pnpm db:smoke` — verifica que las funciones DB con `digest()` son invocables
   Si falla: la migracion rompio algo. Revisar `SET search_path = public, extensions, pg_catalog`.
2. `pnpm e2e:db` — verifica que las rutas de API no devuelven 500 inesperados
   Requiere `NEXT_PUBLIC_SUPABASE_URL` y opcionalmente `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`.

**Smoke tests cubren:**
- `lc_canonical_payload()` — digest() reachable desde la funcion
- `lc_verify_chain_segment()` — digest() reachable desde la funcion
- `POST /api/laborcontrol/fichaje/kiosk` — no 500 (auth barrier)
- `POST /api/tpv/stock/mermas` — no 500 (auth barrier)

**Archivos:**
- `supabase/tests/smoke-db-functions.sql` — SQL smoke tests
- `e2e/db-smoke.spec.ts` — Playwright E2E smoke tests

## Realtime — Patrones Criticos (Waiter System)

> Ver doc completo: `docs/context/realtime-channels.md`

- **StrictMode double-mount**: sufijo de instancia con `useId()`, NO con `Math.random()` (ESLint `react-hooks/purity` lo prohibe). Broadcast channels de nombre fijo: guard async (`if (!waiterEmpresaId) return`).
- **WebSocket singleton**: multiples `postgres_changes` en la misma tabla pueden silenciarse. `WaiterBanner` escucha centralmente y dispara `CustomEvent('waiter-realtime-update')` como fallback DOM.
- **Race en validate loop**: `confirmingRef` como mirror del estado. Relay retorna temprano si `confirmingRef.current.size > 0`.
- **Broadcast llega antes del commit**: para eventos transaccionales (auto-cancel), usar `postgres_changes` no broadcast.

## Complejidad Cognitiva (S3776) — Como se cerro y como no volver

> Ver doc completo: `docs/context/deuda-complejidad.md` (manual de medicion y patrones; las 15 estan cerradas)

- **Medir ANTES de leer el codigo**: script con umbral 0 sobre un fichero lista todas sus funciones. NO usar SonarLint del IDE (subestima). NO presupuestar recortando el fichero por trozos (dos recortes disjuntos sumaron 103 sobre un total real de 78).
- **En JSX solo cuentan los TERNARIOS**: `{x && <p/>}` = 0; `{x ? : }` = 1 al nivel superior, **3 a profundidad 3**. Los de dentro de `.map()`/IIFE no cuentan (funcion anidada). Buscar ternarios profundos antes que bloques grandes — `cart-drawer` estuvo dos intentos atascada por buscar lo segundo.
- **Las funciones anidadas NO suman a la contenedora** — extraer handlers no mueve la aguja.
- **Si extraer un componente pide >~15 props, el estado no tiene dueno**: buscar el hook antes que el componente (asi nacio `usePagoDeMesa`).
- **Mover hooks a un hook propio REORDENA los efectos** (los del hook corren antes que los del componente). No es un movimiento puro — verificar que nada dependa del orden.
- **Patron ganador**: tabla de reglas que devuelve el MOTIVO/VISTA, no un booleano. Test primero, y en pantallas que tocan dinero, equivalencia exhaustiva contra copia literal del codigo viejo antes de sustituir.
- **`substring` vs `slice` con indice -1 NO son equivalentes**: `substring(0,-1)` → `''`; `slice(0,-1)` → recorta el ultimo caracter.

## Mesa/Cobros — Modulos con contrato congelado en tests

- **`src/lib/mesa/vista-mesa.ts`** — que pantalla ve el comensal (`vistaParaMesa`). Las 4 reglas son MUTUAMENTE EXCLUYENTES: aqui el orden NO es contrato (al reves que en `banner-visibilidad.ts` — no asumir lo mismo). 31 tests en `tests/compliance/mesa-vista.test.ts`.
- **`usePagoDeMesa`** (en `mesa-orders-client.tsx`) — dueno de TODO el estado de cobro (locks, mismatch, division, Redsys, bfcache). Depende solo de mesaId/sessionData/setSessionData/refresh. El estado de cobro nuevo va AQUI, no en el componente.
- **`src/lib/waiter/cierre-al-salir.ts`** — que comandas se cierran al cerrar la pestana de barra. El envio (`parchearAlSalir`, `keepalive`) es fuego y olvido: NO verificable; la decision si (15 tests). Heredado y congelado: un pedido enteramente servido sin cuenta atras corriendo NO se cierra al salir.
- **`DatosDelComensal`** (en `cart-drawer.tsx`) — **RGPD: en modo mesa NO se piden datos personales** (la mesa ya identifica el pedido). Invertir la condicion no rompe nada visible y pone la tienda a recoger PII de comensales. 12 tests UI que comprueban AUSENCIA de campos (`tests/ui/datos-del-comensal.test.tsx`).
- **`removeSessionItemUseCase.ts`** — borrar un item del ticket de mesa (camarero suplantando la mesa). Si el item borrado es el ULTIMO de su pedido, el pedido se vacia (`detalle_pedido: []`, `total: 0`, `estado: 'cancelado'`) — nunca se borra la fila (ver trigger `pedidos_no_delete` en la seccion de Compliance). 18 tests en `tests/compliance/mesa-remove-item.test.ts`.

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

## Offline, Resiliencia y UI Optimista — Trampas Criticas

> Ver doc completo: `docs/context/offline-y-resiliencia.md`
> (service worker en detalle: `docs/context/pwa-offline-system.md`)

- **`fetch()` solo falla rapido cuando NO hay red.** Con red DEGRADADA —WiFi asociado sin salida, 4G a una raya— se queda colgado. Es el origen de casi todo el diseno offline de esta app.
- **UI optimista (`patchEstado`)**: ante error del SERVIDOR se hace rollback (la intencion no era valida); ante fallo de RED **no se revierte** y se encola (la intencion sigue siendo valida). Confundir ambos obliga al cocinero a repetir la accion.
- **Cola offline: solo comandos IDEMPOTENTES.** Los pedidos NO se encolan aunque ya exista clave de idempotencia — reproducir una comanda minutos despues manda comida a una mesa que puede haberse levantado.
- **Colapso por `key`**: reproducir estados desordenados dejaria el item en el estado equivocado.
- **Con la pantalla apagada los timers se congelan.** Sincronizar solo con `setInterval` deja un agujero; hay que escuchar `visibilitychange` + `pageshow`, filtrando el sentido (`isResumeSignal`).
- **`navigator.onLine` miente en positivo, no en negativo.** Sirve para evitar un intento condenado, no para confiar en que hay red.
- **Background Sync API no existe en el WebView de Android** (donde vive el APK de Capacitor) ni es fiable en Electron. Evaluada y descartada.
- `public/sw.js` es plain JS, scope `/waiter`. Solo se registra en produccion.
- **`/api/*` es NetworkOnly siempre** — nunca cachear auth ni datos de pedidos.
- **`NetworkFirst` con timeout de 3s** en `/waiter/*` y `bell.mp3`. Sin el, red degradada = pantalla en blanco.

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
  - **Trampa:** `supabase.from('pedidos').delete()` NO lanza excepcion en JS aunque el trigger la lance en Postgres — supabase-js la devuelve en `{ error }`. Si el codigo no revisa ese `error`, un DELETE bloqueado por el trigger queda como exito silencioso: la fila sigue intacta pero la funcion devuelve `success: true`. Paso de verdad: `removeSessionItemUseCase` (borrar el ultimo item de un pedido desde el panel de camarero) intentaba borrar la fila entera y no comprobaba el resultado — la API respondia 200 pero el pedido no se tocaba. Cualquier flujo que necesite "vaciar" un pedido debe reescribir `detalle_pedido: []` / `total: 0` via `updateOrderItems` (que si revisa el error), nunca intentar el DELETE real.
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
