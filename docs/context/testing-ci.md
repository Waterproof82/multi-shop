# Testing & CI

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
| `.github/workflows/compliance.yml` | Push/PR a `main`/`develop` que toque `supabase/migrations/**`, `src/app/api/tpv/**`, `src/app/api/laborcontrol/**`, `src/app/api/admin/rgpd/**`, `electron/main.ts`, `tests/compliance/**` o `e2e/compliance/**` — además lunes 03:00 UTC y manual | `pnpm test:compliance` + `npx playwright test e2e/compliance/` contra `https://mermelada-tomate.vercel.app` |
| `.github/workflows/e2e.yml` | Todo push/PR a `main`/`develop` (sin filtro de paths — cambios de UI en cualquier lado pueden afectar estos flujos) | `npx playwright test e2e/` completo, mismo target |

Los workflows de Playwright pasan `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_URL` desde secrets/vars del repo. `e2e.yml` también reenvía `PLAYWRIGHT_WAITER_PIN`/`PLAYWRIGHT_WAITER_TOKEN`/`PLAYWRIGHT_ADMIN_EMAIL`/`PLAYWRIGHT_ADMIN_PASSWORD` si existen como secrets — si no están configurados, esos tests puntuales se omiten en CI exactamente igual que en local.

`compliance.yml` y `e2e.yml` se solapan parcialmente (`e2e.yml` incluye `e2e/compliance/`) — es intencional: `compliance.yml` da feedback rápido y dirigido en cambios de migración/legal, `e2e.yml` es el gate exhaustivo en todo push. El costo de correr esos tests dos veces es bajo (son idempotentes, de solo lectura o con guards de limpieza) frente al valor de no depender de acordarse de tocar el path correcto.

## Cómo agregar un test de regresión de seguridad nuevo

Patrón establecido en el incidente RLS del 2026-07-31 (ver [`security.md`](./security.md)):

1. **Si el chequeo necesita introspección SQL** (policies, grants, `pg_catalog`) que PostgREST no expone directo: crear una función `SECURITY DEFINER` en una migración que envuelva la query, con los 3 `REVOKE` + `GRANT TO service_role` de siempre (ver plantilla en `security.md` → "Funciones SECURITY DEFINER"). Ejemplos: `check_security_definer_grants()`, `check_rls_policy_hygiene()`.
2. **El test Playwright** llama esa función vía `POST /rest/v1/rpc/<nombre>` con `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`, y agrega un test extra que confirma que la función **no** es callable con la `anon` key (200 = fallo crítico, la propia auditoría quedó expuesta).
3. **Preferí un chequeo de todo el schema sobre uno tabla-por-tabla** cuando el patrón lo permita — un test que escanea `pg_policies`/`pg_proc` completo cubre tablas que todavía no existen; un test que lista 3 tablas a mano solo protege esas 3.
4. Poné el archivo en `e2e/compliance/` — así queda cubierto automáticamente por `compliance.yml` (si toca paths relevantes) y por `e2e.yml` (siempre), sin tocar ningún workflow.
5. Para chequeos estáticos de código (grep de patrones inseguros en el código fuente, sin tocar la DB): `tests/compliance/*.test.ts` con Vitest, mismo patrón que `secrets-scan.test.ts` y `cron-secret-timing-safe.test.ts`.
