# Testing & CI

> **Contexto de por qué la suite creció de 10 a 25 ficheros en agosto de 2026:**
> ver [`offline-y-resiliencia.md`](./offline-y-resiliencia.md), sección 5. En
> resumen: `vitest` no resolvía el alias `@/`, así que **ningún test podía
> importar `src/core`**. Toda la capa de aplicación e infraestructura era
> intesteable — no por decisión, por el runner.

## Contra qué corre el E2E (importante)

`PLAYWRIGHT_BASE_URL` **ya no apunta a una URL fija**. Antes lo hacía, y eso
significaba que en un pull request la suite interrogaba el sitio **ya
desplegado** en vez del código propuesto: pasaba en verde aunque el PR estuviera
roto.

| Evento | Contra qué | Tests que corren |
|---|---|---|
| Pull request | preview efímera de ESE commit | ~143 de 214 |
| Push a `main`/`develop` | alias del entorno, tras confirmar el despliegue | ~205 de 214 |

La diferencia no es arbitraria: el tenant se resuelve por **hostname**, y una
preview tiene un host efímero que no está en `empresas.dominio`. Sin tenant, los
flujos con sesión de camarero no pueden correr. Detalle completo en la cabecera
de `.github/workflows/e2e.yml`.

**Las PRs de Dependabot omiten el E2E a propósito**: GitHub no les entrega los
secrets del repositorio (van a un almacén aparte), y rellenarlo sería dar la
`service_role` key a código de dependencias sin revisar.

## Suites de test

| Comando | Motor | Qué cubre | Requiere |
|---------|-------|-----------|----------|
| `pnpm lint` | ESLint | Estilo y reglas de código en `src/**/*.{ts,tsx}` | — |
| `pnpm typecheck` | `tsc --noEmit` | Tipos en todo el proyecto (`tsconfig.typecheck.json`) | — |
| `pnpm test:compliance` | Vitest | Tests estáticos rápidos: secrets hardcodeados, patrones de código inseguro, invariantes sin red (`tests/compliance/`) | — |
| `npx playwright test e2e/compliance/` | Playwright | Regresión legal/fiscal contra Supabase real: RLS, inalterabilidad, cadenas de hash, RGPD (`e2e/compliance/`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` |
| `npx playwright test e2e/` | Playwright | Suite completa: lo anterior + flujos de camarero/cocina/CSRF/DB smoke | Igual que arriba; algunos tests adicionales requieren `PLAYWRIGHT_WAITER_PIN`, `PLAYWRIGHT_ADMIN_EMAIL`/`PASSWORD` — se omiten (skip) si no están definidos |
| `pnpm db:smoke` | `supabase db query --linked` | Verifica que las funciones DB con `digest()` (pgcrypto) son invocables tras una migración | Login activo del Supabase CLI (`supabase login`) |

Todos los tests con `test.skip(!process.env.X, ...)` se omiten limpiamente si falta la env var — nunca fallan por eso.

## Git hooks (Husky)

Instalados vía `"prepare": "husky"` en `package.json` — se activan solos al correr `pnpm install`, no hace falta configurarlos a mano en ningún clon.

| Hook | Comando | Cuándo |
|------|---------|--------|
| `.husky/pre-commit` | `pnpm lint && pnpm typecheck` | En cada `git commit` — rápido (segundos), no requiere red |
| `.husky/pre-push` | `pnpm test:compliance && npx playwright test e2e/ --reporter=list` | En cada `git push` — la suite pesada, habla con Supabase real |

**Por qué la suite pesada va en `pre-push` y no en `pre-commit`:** forzar ~30s+ de tests con acceso a red en cada commit (incluyendo commits chicos/WIP) frena el día a día y tienta a saltear el hook con `--no-verify`, lo que anula el propósito. `pre-push` sigue bloqueando el código antes de que salga de la máquina, a una cadencia que no estorba.

Un hook que falla **aborta** el commit/push — no es una advertencia. `--no-verify` lo saltea; no usarlo salvo caso excepcional explícito.

## CI (GitHub Actions)

| Workflow | Trigger | Qué corre |
|----------|---------|-----------|
| `.github/workflows/ci.yml` | Todo push/PR a `main`/`develop` | `pnpm lint` + `pnpm typecheck` + `pnpm build` |
| `.github/workflows/compliance.yml` | Push/PR a `main`/`develop` que toque `supabase/migrations/**`, `src/app/api/tpv/**`, `src/app/api/laborcontrol/**`, `src/app/api/admin/rgpd/**`, `src/app/api/mesas/**`, `src/app/api/glovo/**`, `src/proxy.ts`, `electron/main.ts`, `tests/compliance/**` o `e2e/compliance/**` — además lunes 03:00 UTC y manual | `pnpm test:compliance` + `npx playwright test e2e/compliance/` contra `https://mermelada-tomate.vercel.app` |
| `.github/workflows/e2e.yml` | Todo push/PR a `main`/`develop` (sin filtro de paths — cambios de UI en cualquier lado pueden afectar estos flujos) | `npx playwright test e2e/` completo, mismo target |

Los workflows de Playwright pasan `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_URL` desde secrets/vars del repo. `e2e.yml` también reenvía `PLAYWRIGHT_WAITER_PIN`/`PLAYWRIGHT_WAITER_TOKEN`/`PLAYWRIGHT_ADMIN_EMAIL`/`PLAYWRIGHT_ADMIN_PASSWORD` si existen como secrets — si no están configurados, esos tests puntuales se omiten en CI exactamente igual que en local.

`compliance.yml` y `e2e.yml` se solapan parcialmente (`e2e.yml` incluye `e2e/compliance/`) — es intencional: `compliance.yml` da feedback rápido y dirigido en cambios de migración/legal, `e2e.yml` es el gate exhaustivo en todo push. El costo de correr esos tests dos veces es bajo (son idempotentes, de solo lectura o con guards de limpieza) frente al valor de no depender de acordarse de tocar el path correcto.

## Cómo agregar un test de regresión de seguridad nuevo

Patrón establecido en el incidente RLS del 2026-07-31 (ver [`security.md`](./security.md)):

1. **Si el chequeo necesita introspección SQL** (policies, grants, `pg_catalog`) que PostgREST no expone directo: crear una función `SECURITY DEFINER` en una migración que envuelva la query, con los 3 `REVOKE` + `GRANT TO service_role` de siempre (ver plantilla en `security.md` → "Funciones SECURITY DEFINER"). Ejemplos: `check_public_function_grants()`, `check_rls_policy_hygiene()`.
2. **El test Playwright** llama esa función vía `POST /rest/v1/rpc/<nombre>` con `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`, y agrega un test extra que confirma que la función **no** es callable con la `anon` key (200 = fallo crítico, la propia auditoría quedó expuesta).
3. **Preferí un chequeo de todo el schema sobre uno tabla-por-tabla** cuando el patrón lo permita — un test que escanea `pg_policies`/`pg_proc` completo cubre tablas que todavía no existen; un test que lista 3 tablas a mano solo protege esas 3.
4. **Auditá el GRANT, no solo la policy que lo restringe.** Los primeros 9 checks de `check_rls_policy_hygiene()` verifican la forma de las policies de RLS y asumen que el GRANT de tabla subyacente ya es mínimo. El check `anon_write_grant` (`20260731000019`) nació de una auditoría externa que encontró el hueco: las 53 tablas preexistentes seguían con `INSERT/UPDATE/DELETE/TRUNCATE` de `anon` heredado de un default previo al fix de `20260731000017` — que solo protege objetos **nuevos**, nunca revoca retroactivamente. `TRUNCATE` en particular no está sujeto a RLS bajo ninguna policy, por bien escrita que esté — es el motivo por el que este chequeo tiene que vivir a nivel de GRANT, no de policy. Antes de dar por cerrada una clase de vulnerabilidad, preguntate si el fix cubre objetos futuros, objetos existentes, o ambos.
5. **Para rutas fuera de RLS (Next.js API routes), auditá qué prefijo de `src/proxy.ts` las cubre antes de confiar en cualquier header de identidad.** `proxy.ts` solo verifica/sobreescribe `x-empresa-id`/`x-admin-rol` para rutas bajo `/api/admin`, `/api/waiter`, `/api/kitchen`, `/api/tpv`, `/api/laborcontrol`, `/api/superadmin`. Cualquier ruta nueva fuera de esos 6 prefijos (ej. `/api/mesas/*`, `/api/glovo/order` — ver incidente en `security.md`) recibe esos headers **tal cual los mandó el cliente**, sin sanear. Si la ruta necesita el tenant, derivalo por dominio (`getDomainFromHeaders` + `parseMainDomain`) o por una sesión verificada en el propio handler — nunca leyendo el header como si `proxy.ts` ya lo hubiera validado. Test de regresión para esta clase: `e2e/compliance/mesas-tenant-header-spoofing.spec.ts` — compara la respuesta con un header `x-empresa-id` falsificado contra la respuesta sin header; deben ser idénticas.
6. Poné el archivo en `e2e/compliance/` — así queda cubierto automáticamente por `compliance.yml` (si toca paths relevantes) y por `e2e.yml` (siempre). Si el hallazgo es en código de rutas (no en la DB), considerá agregar esos paths al filtro de `compliance.yml` para feedback dirigido (se hizo para `src/proxy.ts`, `src/app/api/mesas/**` y `src/app/api/glovo/**` en este mismo incidente).
7. Para chequeos estáticos de código (grep de patrones inseguros en el código fuente, sin tocar la DB): `tests/compliance/*.test.ts` con Vitest, mismo patrón que `secrets-scan.test.ts` y `cron-secret-timing-safe.test.ts`.
