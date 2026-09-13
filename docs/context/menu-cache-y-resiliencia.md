# Menú Público — Cache y Resiliencia (GET /)

Documento de referencia sobre tres fixes aplicados el 2026-09-13 a raíz de
Sentry en producción sobre `GET /` (carta pública). Los tres cubren
**resiliencia y performance**, no seguridad — ver la nota al final.

---

## 1. Retry ante timeouts transitorios de PostgREST

**Síntoma:** Sentry 329c2bc182a648458a742db51bd180af — `Gateway Timeout` en
`SupabaseCategoryRepository.findAllByTenant`.

**Causa:** PostgREST (Warp) mata threads por su propio timeout de pool como
ruido de fondo constante — no es un incidente real de carga. Mismo patrón que
los fixes previos de login (`656da96a`) y purga RGPD (`e1b0ca55`).

**Fix:** `findAllByTenant` en categorías, productos y
complemento_grupos/opciones —las tres llamadas en paralelo que
`GetMenuUseCase.execute` dispara en `GET /`— reintentan una vez de forma
inmediata si el error matchea `/timeout|gateway/i`. Son `SELECT` puros: más
seguro reintentar que el `UPDATE` de la purga RGPD, no requiere análisis de
idempotencia.

**Archivos:** `SupabaseCategoryRepository.ts`, `SupabaseProductRepository.ts`,
`supabase-complemento-grupo.repository.ts`.

## 2. `getCachedMenu` no debe cachear un `Result` fallido

**Síntoma:** Sentry ca345ef3d53744ecb20dd05c7a578ed1 — `MENU_FETCH_ERROR`,
30 min después del timeout de arriba, **mismo `empresa_id`, dominio
distinto** (`pedidos.almadearena.es` vs `www.almadearena.es`).

**Causa real:** no era un segundo fallo de DB — era el primero, servido de
nuevo desde cache. `unstable_cache` (Vercel Data Cache) solo se salta el
cacheo si la función envuelta **lanza**; cachea igual cualquier valor que
*resuelva*, y `GetMenuUseCase.execute` devuelve `{ error }` como valor normal
ante un timeout transitorio (no lanza). Sin corregirlo, un único blip de
PostgREST quedaba congelado como "sin categorías" durante los 3600s completos
del `revalidate`. La key de cache es `catalogTag(empresaId)` — **por empresa,
no por dominio** — así que el error afectaba a TODOS los subdominios del
tenant, no solo al que originó el timeout.

**Fix:** `getCachedMenu` ahora lanza dentro de la función cacheada cuando el
use-case devuelve `error`, y lo atrapa afuera para devolver el mismo shape
`{ error }` de siempre. Cero cambios en los callers (`page.tsx`,
`api/waiter/catalog/route.ts`). Test de regresión
(`tests/core/get-cached-menu-no-cache-on-error.test.ts`) verifica
explícitamente que la función pasada a `unstable_cache` lanza ante ese error.

**Archivo:** `src/lib/server-services.ts`.

**Nota para el próximo caso similar:** cualquier otro `unstable_cache` que
envuelva un `Result<T, E>` (patrón estándar del proyecto) tiene el mismo
riesgo si la rama de error no lanza. Revisar antes de replicar el patrón.

## 3. LCP: `SubcategorySection` nunca propagaba `priority`

**Síntoma:** warning de consola — imagen de producto detectada como LCP sin
`loading="eager"`.

**Causa:** `MenuSection` ya tenía un sistema deliberado de prioridad
(`priority={index === 0}` por categoría en `client-menu-page.tsx`, luego
`loading="eager"` en los primeros 3 ítems — coincide con el breakpoint
`lg:grid-cols-3`). Pero ese sistema **solo corría en la rama sin
subcategorías**. Cuando la categoría usa subcategorías
(`categoria_padre_id`), se renderiza `SubcategorySection` en su lugar, cuya
interfaz de props nunca incluyó `priority`: todo producto agrupado en
subcategorías salía `loading="lazy"` sin excepción, incluida la primera
imagen de toda la página. No depende de dispositivo ni viewport — es un path
de código que falla siempre para cualquier tenant con subcategorías en su
primera categoría.

**Fix:** `SubcategorySection` acepta `priority` y lo aplica a sus primeros 3
productos, igual que la rama plana. `MenuSection` solo lo pasa en `true` a la
primera subcategoría visible.

**Archivo:** `src/components/menu-section.tsx`.

---

## ¿Esto es "seguridad"?

No en el sentido de `docs/context/security.md` (autenticación, RBAC, CSRF,
RLS, inyección). Los tres fixes son de **disponibilidad/resiliencia** (1 y 2)
y **performance** (3):

- Ninguno toca autenticación, autorización, secrets ni políticas RLS.
- El retry (fix 1) re-ejecuta la **misma query exacta** con el mismo cliente
  (`getSupabaseAnonClient()`) — no cambia el trust boundary ni el alcance de
  datos.
- El fix de cache (2) no cambia qué datos se sirven ni a quién — solo cuánto
  tiempo puede quedar "congelado" un error transitorio.
- El fix de LCP (3) es una prop de renderizado del lado del cliente, sin
  relación con datos sensibles.

No se detectó ni se introdujo ninguna vulnerabilidad de seguridad en esta
sesión. Si aparece un hallazgo de seguridad real, va en
`docs/context/security.md`, no acá.
