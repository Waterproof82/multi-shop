# Lazy Service Locator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `src/core/infrastructure/database/index.ts` from eager module-level initialization to lazy singleton getter functions so imports have zero side effects and the codebase becomes unit-testable.

**Architecture:** Replace every `export const xUseCase = new X(...)` with `export function getXUseCase(): X { return _x ??= new X(...) }`. The `??=` operator preserves singleton behavior. Supabase is never initialized until the first actual call. TypeScript compilation errors after changing `index.ts` serve as the precise list of files to update.

**Tech Stack:** TypeScript, Next.js 16 App Router, pnpm, fd + sd (for bulk replacement)

---

### Task 1: Create branch

**Files:**
- No file changes

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd "C:\Users\PC\Desktop\multi_shop"
git checkout develop
git checkout -b refactor/lazy-service-locator
```

Expected: `Switched to a new branch 'refactor/lazy-service-locator'`

- [ ] **Step 2: Confirm clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

---

### Task 2: Rewrite `index.ts` with lazy getters

**Files:**
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Replace the entire file**

Write `src/core/infrastructure/database/index.ts` with this exact content:

```typescript
import { getSupabaseClient, getSupabaseAnonClient } from './supabase-client';
import { SupabaseProductRepository } from './SupabaseProductRepository';
import { SupabaseCategoryRepository } from './SupabaseCategoryRepository';
import { SupabaseAdminRepository } from './SupabaseAdminRepository';
import { SupabaseClienteRepository } from './supabase-cliente.repository';
import { SupabaseEmpresaRepository } from './supabase-empresa.repository';
import { SupabasePromocionRepository } from './supabase-promocion.repository';
import { SupabasePedidoRepository } from './supabase-pedido.repository';
import { SupabaseMesaRepository } from './supabase-mesa.repository';
import { SupabaseMesaSesionRepository } from './supabase-mesa-sesion.repository';
import { SupabaseSuperAdminRepository } from './SupabaseSuperAdminRepository';
import { SupabaseTgtgRepository } from './supabase-tgtg.repository';
import { SupabaseDescuentoRepository } from './supabase-descuento.repository';
import { SupabaseMesaClientTokenRepository } from './supabase-mesa-client-token.repository';
import { SupabaseValoracionRepository } from './supabase-valoracion.repository';
import { SupabaseEmpleadoTpvRepository } from '../repositories/supabase-empleado-tpv.repository';
import { ProductUseCase } from '@/core/application/use-cases/product.use-case';
import { CategoryUseCase } from '@/core/application/use-cases/category.use-case';
import { ClienteUseCase } from '@/core/application/use-cases/cliente.use-case';
import { EmpresaUseCase } from '@/core/application/use-cases/empresa.use-case';
import { PedidoUseCase } from '@/core/application/use-cases/pedido.use-case';
import { MesaUseCase } from '@/core/application/use-cases/mesa.use-case';
import { MesaSesionUseCase } from '@/core/application/use-cases/mesa-sesion.use-case';
import { PromocionUseCase } from '@/core/application/use-cases/promocion.use-case';
import { TgtgUseCase } from '@/core/application/use-cases/tgtg.use-case';
import { AuthAdminUseCase } from '@/core/application/use-cases/auth-admin.use-case';
import { SuperAdminUseCase } from '@/core/application/use-cases/superadmin.use-case';
import { DescuentoUseCase } from '@/core/application/use-cases/descuento.use-case';
import { MesaClientTokenUseCase } from '@/core/application/use-cases/mesa-client-token.use-case';
import { ValoracionUseCase } from '@/core/application/use-cases/valoracion.use-case';
import { EmpleadoTpvLoginUseCase } from '@/core/application/use-cases/tpv/empleado-tpv-login.use-case';
import { SupabaseComplementoGrupoRepository } from './supabase-complemento-grupo.repository';
import { ComplementoGrupoUseCase } from '@/core/application/use-cases/complemento-grupo.use-case';

// ---------------------------------------------------------------------------
// Private lazy repository getters (shared between use cases, not exported)
// ---------------------------------------------------------------------------

let _clienteRepository: SupabaseClienteRepository | undefined;
function getClienteRepository(): SupabaseClienteRepository {
  return _clienteRepository ??= new SupabaseClienteRepository(getSupabaseClient());
}

let _productRepository: SupabaseProductRepository | undefined;
function getProductRepository(): SupabaseProductRepository {
  return _productRepository ??= new SupabaseProductRepository(getSupabaseClient());
}

let _descuentoRepository: SupabaseDescuentoRepository | undefined;
function getDescuentoRepository(): SupabaseDescuentoRepository {
  return _descuentoRepository ??= new SupabaseDescuentoRepository(getSupabaseClient());
}

// ---------------------------------------------------------------------------
// Public lazy repository getters (used directly by some routes/use-cases)
// ---------------------------------------------------------------------------

let _empresaRepository: SupabaseEmpresaRepository | undefined;
export function getEmpresaRepository(): SupabaseEmpresaRepository {
  return _empresaRepository ??= new SupabaseEmpresaRepository(getSupabaseClient());
}

let _pedidoRepository: SupabasePedidoRepository | undefined;
export function getPedidoRepository(): SupabasePedidoRepository {
  return _pedidoRepository ??= new SupabasePedidoRepository(getSupabaseClient());
}

let _mesaRepository: SupabaseMesaRepository | undefined;
export function getMesaRepository(): SupabaseMesaRepository {
  return _mesaRepository ??= new SupabaseMesaRepository(getSupabaseClient());
}

let _mesaSesionRepository: SupabaseMesaSesionRepository | undefined;
export function getMesaSesionRepository(): SupabaseMesaSesionRepository {
  return _mesaSesionRepository ??= new SupabaseMesaSesionRepository(getSupabaseClient());
}

let _valoracionRepository: SupabaseValoracionRepository | undefined;
export function getValoracionRepository(): SupabaseValoracionRepository {
  return _valoracionRepository ??= new SupabaseValoracionRepository(getSupabaseClient());
}

let _empleadoTpvRepository: SupabaseEmpleadoTpvRepository | undefined;
export function getEmpleadoTpvRepository(): SupabaseEmpleadoTpvRepository {
  return _empleadoTpvRepository ??= new SupabaseEmpleadoTpvRepository();
}

let _complementoGrupoRepository: SupabaseComplementoGrupoRepository | undefined;
export function getComplementoGrupoRepository(): SupabaseComplementoGrupoRepository {
  return _complementoGrupoRepository ??= new SupabaseComplementoGrupoRepository(getSupabaseClient());
}

let _empresaPublicRepository: SupabaseEmpresaRepository | undefined;
export function getEmpresaPublicRepository(): SupabaseEmpresaRepository {
  return _empresaPublicRepository ??= new SupabaseEmpresaRepository(getSupabaseAnonClient());
}

// ---------------------------------------------------------------------------
// Public lazy use case getters
// ---------------------------------------------------------------------------

let _productUseCase: ProductUseCase | undefined;
export function getProductUseCase(): ProductUseCase {
  return _productUseCase ??= new ProductUseCase(getProductRepository());
}

let _categoryUseCase: CategoryUseCase | undefined;
export function getCategoryUseCase(): CategoryUseCase {
  return _categoryUseCase ??= new CategoryUseCase(
    new SupabaseCategoryRepository(getSupabaseClient())
  );
}

let _clienteUseCase: ClienteUseCase | undefined;
export function getClienteUseCase(): ClienteUseCase {
  return _clienteUseCase ??= new ClienteUseCase(getClienteRepository());
}

let _empresaUseCase: EmpresaUseCase | undefined;
export function getEmpresaUseCase(): EmpresaUseCase {
  return _empresaUseCase ??= new EmpresaUseCase(getEmpresaRepository());
}

let _pedidoUseCase: PedidoUseCase | undefined;
export function getPedidoUseCase(): PedidoUseCase {
  return _pedidoUseCase ??= new PedidoUseCase(
    getPedidoRepository(),
    getClienteRepository(),
    getProductRepository(),
    getDescuentoRepository(),
    getMesaSesionRepository()
  );
}

let _mesaUseCase: MesaUseCase | undefined;
export function getMesaUseCase(): MesaUseCase {
  return _mesaUseCase ??= new MesaUseCase(getMesaRepository());
}

let _mesaSesionUseCase: MesaSesionUseCase | undefined;
export function getMesaSesionUseCase(): MesaSesionUseCase {
  return _mesaSesionUseCase ??= new MesaSesionUseCase(
    getMesaSesionRepository(),
    getMesaRepository()
  );
}

let _promocionUseCase: PromocionUseCase | undefined;
export function getPromocionUseCase(): PromocionUseCase {
  return _promocionUseCase ??= new PromocionUseCase(
    new SupabasePromocionRepository(getSupabaseClient()),
    getClienteRepository()
  );
}

let _tgtgUseCase: TgtgUseCase | undefined;
export function getTgtgUseCase(): TgtgUseCase {
  return _tgtgUseCase ??= new TgtgUseCase(
    new SupabaseTgtgRepository(getSupabaseClient()),
    getClienteRepository()
  );
}

let _authAdminUseCase: AuthAdminUseCase | undefined;
export function getAuthAdminUseCase(): AuthAdminUseCase {
  return _authAdminUseCase ??= new AuthAdminUseCase(
    new SupabaseAdminRepository(getSupabaseClient(), getSupabaseAnonClient())
  );
}

let _superAdminUseCase: SuperAdminUseCase | undefined;
export function getSuperAdminUseCase(): SuperAdminUseCase {
  return _superAdminUseCase ??= new SuperAdminUseCase(
    new SupabaseSuperAdminRepository(getSupabaseClient())
  );
}

let _descuentoUseCase: DescuentoUseCase | undefined;
export function getDescuentoUseCase(): DescuentoUseCase {
  return _descuentoUseCase ??= new DescuentoUseCase(
    getDescuentoRepository(),
    getEmpresaRepository()
  );
}

let _mesaClientTokenUseCase: MesaClientTokenUseCase | undefined;
export function getMesaClientTokenUseCase(): MesaClientTokenUseCase {
  return _mesaClientTokenUseCase ??= new MesaClientTokenUseCase(
    new SupabaseMesaClientTokenRepository(getSupabaseClient()),
    getMesaSesionRepository()
  );
}

let _valoracionUseCase: ValoracionUseCase | undefined;
export function getValoracionUseCase(): ValoracionUseCase {
  return _valoracionUseCase ??= new ValoracionUseCase(getValoracionRepository());
}

let _empleadoTpvLoginUseCase: EmpleadoTpvLoginUseCase | undefined;
export function getEmpleadoTpvLoginUseCase(): EmpleadoTpvLoginUseCase {
  return _empleadoTpvLoginUseCase ??= new EmpleadoTpvLoginUseCase(getEmpleadoTpvRepository());
}

let _complementoGrupoUseCase: ComplementoGrupoUseCase | undefined;
export function getComplementoGrupoUseCase(): ComplementoGrupoUseCase {
  return _complementoGrupoUseCase ??= new ComplementoGrupoUseCase(getComplementoGrupoRepository());
}
```

- [ ] **Step 2: Verify the file has no module-level Supabase calls**

```bash
grep -n "getSupabaseClient\(\)\|getSupabaseAnonClient\(\)" src/core/infrastructure/database/index.ts | head -5
```

Expected: zero matches outside function bodies (all calls are inside `function get...()` bodies).

- [ ] **Step 3: Run typecheck to get the full list of broken call sites**

```bash
cd "C:\Users\PC\Desktop\multi_shop"
pnpm typecheck 2>&1 | grep "has no exported member" | sort -u
```

Expected: ~24 unique export names flagged across ~72+ files. Save this output — it's the precise work list for Task 3.

- [ ] **Step 4: Commit index.ts**

```bash
git add src/core/infrastructure/database/index.ts
git commit -m "refactor(db): convert service locator to lazy getter functions"
```

---

### Task 3: Update all call sites (bulk replacement)

**Files:**
- Modify: all `src/**/*.ts` and `src/**/*.tsx` files that import from `@/core/infrastructure/database`

This task uses `sd` (stream editor) to do word-boundary replacements across all TypeScript files. Two passes per export: first fix usages (`.method()`), then fix import names.

- [ ] **Step 1: Install `sd` if not available**

```bash
sd --version 2>/dev/null || cargo install sd
```

If cargo is not available: `winget install BurntSushi.ripgrep.MSVC` then install sd from https://github.com/chmln/sd/releases.

Alternatively, use the Node.js `replace-in-files` approach in Step 2.

- [ ] **Step 2: Run the bulk replacement script**

Run each line in sequence. The order matters: replace `.method()` usage BEFORE replacing import names.

```bash
# --- Usage replacements (xUseCase.method → getXUseCase().method) ---
sd '\bempresaRepository\.' 'getEmpresaRepository().' $(fd '\.tsx?$' src)
sd '\bpedidoRepository\.' 'getPedidoRepository().' $(fd '\.tsx?$' src)
sd '\bmesaRepository\.' 'getMesaRepository().' $(fd '\.tsx?$' src)
sd '\bmesaSesionRepository\.' 'getMesaSesionRepository().' $(fd '\.tsx?$' src)
sd '\bvaloracionRepository\.' 'getValoracionRepository().' $(fd '\.tsx?$' src)
sd '\bempleadoTpvRepository\.' 'getEmpleadoTpvRepository().' $(fd '\.tsx?$' src)
sd '\bcomplementoGrupoRepository\.' 'getComplementoGrupoRepository().' $(fd '\.tsx?$' src)
sd '\bempresaPublicRepository\.' 'getEmpresaPublicRepository().' $(fd '\.tsx?$' src)
sd '\bproductUseCase\.' 'getProductUseCase().' $(fd '\.tsx?$' src)
sd '\bcategoryUseCase\.' 'getCategoryUseCase().' $(fd '\.tsx?$' src)
sd '\bclienteUseCase\.' 'getClienteUseCase().' $(fd '\.tsx?$' src)
sd '\bempresaUseCase\.' 'getEmpresaUseCase().' $(fd '\.tsx?$' src)
sd '\bpedidoUseCase\.' 'getPedidoUseCase().' $(fd '\.tsx?$' src)
sd '\bmesaUseCase\.' 'getMesaUseCase().' $(fd '\.tsx?$' src)
sd '\bmesaSesionUseCase\.' 'getMesaSesionUseCase().' $(fd '\.tsx?$' src)
sd '\bpromocionUseCase\.' 'getPromocionUseCase().' $(fd '\.tsx?$' src)
sd '\btgtgUseCase\.' 'getTgtgUseCase().' $(fd '\.tsx?$' src)
sd '\bauthAdminUseCase\.' 'getAuthAdminUseCase().' $(fd '\.tsx?$' src)
sd '\bsuperAdminUseCase\.' 'getSuperAdminUseCase().' $(fd '\.tsx?$' src)
sd '\bdescuentoUseCase\.' 'getDescuentoUseCase().' $(fd '\.tsx?$' src)
sd '\bmesaClientTokenUseCase\.' 'getMesaClientTokenUseCase().' $(fd '\.tsx?$' src)
sd '\bvaloracionUseCase\.' 'getValoracionUseCase().' $(fd '\.tsx?$' src)
sd '\bempleadoTpvLoginUseCase\.' 'getEmpleadoTpvLoginUseCase().' $(fd '\.tsx?$' src)
sd '\bcomplementoGrupoUseCase\.' 'getComplementoGrupoUseCase().' $(fd '\.tsx?$' src)

# --- Import name replacements (remaining occurrences in import statements) ---
sd '\bempresaRepository\b' 'getEmpresaRepository' $(fd '\.tsx?$' src)
sd '\bpedidoRepository\b' 'getPedidoRepository' $(fd '\.tsx?$' src)
sd '\bmesaRepository\b' 'getMesaRepository' $(fd '\.tsx?$' src)
sd '\bmesaSesionRepository\b' 'getMesaSesionRepository' $(fd '\.tsx?$' src)
sd '\bvaloracionRepository\b' 'getValoracionRepository' $(fd '\.tsx?$' src)
sd '\bempleadoTpvRepository\b' 'getEmpleadoTpvRepository' $(fd '\.tsx?$' src)
sd '\bcomplementoGrupoRepository\b' 'getComplementoGrupoRepository' $(fd '\.tsx?$' src)
sd '\bempresaPublicRepository\b' 'getEmpresaPublicRepository' $(fd '\.tsx?$' src)
sd '\bproductUseCase\b' 'getProductUseCase' $(fd '\.tsx?$' src)
sd '\bcategoryUseCase\b' 'getCategoryUseCase' $(fd '\.tsx?$' src)
sd '\bclienteUseCase\b' 'getClienteUseCase' $(fd '\.tsx?$' src)
sd '\bempresaUseCase\b' 'getEmpresaUseCase' $(fd '\.tsx?$' src)
sd '\bpedidoUseCase\b' 'getPedidoUseCase' $(fd '\.tsx?$' src)
sd '\bmesaUseCase\b' 'getMesaUseCase' $(fd '\.tsx?$' src)
sd '\bmesaSesionUseCase\b' 'getMesaSesionUseCase' $(fd '\.tsx?$' src)
sd '\bpromocionUseCase\b' 'getPromocionUseCase' $(fd '\.tsx?$' src)
sd '\btgtgUseCase\b' 'getTgtgUseCase' $(fd '\.tsx?$' src)
sd '\bauthAdminUseCase\b' 'getAuthAdminUseCase' $(fd '\.tsx?$' src)
sd '\bsuperAdminUseCase\b' 'getSuperAdminUseCase' $(fd '\.tsx?$' src)
sd '\bdescuentoUseCase\b' 'getDescuentoUseCase' $(fd '\.tsx?$' src)
sd '\bmesaClientTokenUseCase\b' 'getMesaClientTokenUseCase' $(fd '\.tsx?$' src)
sd '\bvaloracionUseCase\b' 'getValoracionUseCase' $(fd '\.tsx?$' src)
sd '\bempleadoTpvLoginUseCase\b' 'getEmpleadoTpvLoginUseCase' $(fd '\.tsx?$' src)
sd '\bcomplementoGrupoUseCase\b' 'getComplementoGrupoUseCase' $(fd '\.tsx?$' src)
```

- [ ] **Step 3: Run typecheck to verify no remaining broken imports**

```bash
pnpm typecheck 2>&1 | grep "has no exported member"
```

Expected: zero lines. If any remain, they are exotic patterns (dynamic imports, etc.) — fix them manually by reading the error and editing the specific file.

- [ ] **Step 4: Spot-check a representative file**

```bash
grep -n "getProductUseCase\|getAuthAdminUseCase\|getMesaRepository" src/app/api/admin/productos/route.ts | head -10
```

Expected: lines showing `getProductUseCase()` (with parentheses) in usage, and `getProductUseCase` (without) in the import statement.

- [ ] **Step 5: Commit all call site updates**

```bash
git add -A
git commit -m "refactor(db): update all call sites to use lazy getter functions"
```

---

### Task 4: Update `server-services.ts`

**Files:**
- Modify: `src/lib/server-services.ts`

- [ ] **Step 1: Replace module-level init with lazy getter**

In `src/lib/server-services.ts`, replace these lines:

```typescript
// REMOVE these 3 lines (lines 14-16):
const supabase = getSupabaseAnonClient();
const productRepo = new SupabaseProductRepository(supabase);
const categoryRepo = new SupabaseCategoryRepository(supabase);

// REMOVE this import from line 4:
import { getSupabaseAnonClient } from "@/core/infrastructure/database/supabase-client";
// REMOVE these imports from line 5-6:
import { SupabaseProductRepository } from "@/core/infrastructure/database/SupabaseProductRepository";
import { SupabaseCategoryRepository } from "@/core/infrastructure/database/SupabaseCategoryRepository";

// CHANGE line 8 from:
import { empresaPublicRepository, complementoGrupoRepository } from "@/core/infrastructure/database";
// TO:
import { getEmpresaPublicRepository, getComplementoGrupoRepository } from "@/core/infrastructure/database";

// CHANGE line 19 from:
export const getMenuUseCase = new GetMenuUseCase(productRepo, categoryRepo, complementoGrupoRepository);
// TO (lazy singleton, private):
let _menuUseCase: GetMenuUseCase | undefined;
function getMenuUseCase(): GetMenuUseCase {
  return _menuUseCase ??= new GetMenuUseCase(
    new SupabaseProductRepository(getSupabaseAnonClient()),
    new SupabaseCategoryRepository(getSupabaseAnonClient()),
    getComplementoGrupoRepository()
  );
}
```

Also add back the needed imports at the top:
```typescript
import { getSupabaseAnonClient } from "@/core/infrastructure/database/supabase-client";
import { SupabaseProductRepository } from "@/core/infrastructure/database/SupabaseProductRepository";
import { SupabaseCategoryRepository } from "@/core/infrastructure/database/SupabaseCategoryRepository";
```

Then update `getEmpresaByDomain` to use the getter:
```typescript
// CHANGE:
const result = await empresaPublicRepository.findByDomainPublic(mainDomain);
// TO:
const result = await getEmpresaPublicRepository().findByDomainPublic(mainDomain);
```

And update `getCachedMenu` to call the function:
```typescript
// CHANGE:
async () => getMenuUseCase.execute(empresaId),
// TO:
async () => getMenuUseCase().execute(empresaId),
```

- [ ] **Step 2: Typecheck to verify**

```bash
pnpm typecheck 2>&1 | grep "server-services"
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server-services.ts
git commit -m "refactor(server-services): lazy init for menu use case and public repos"
```

---

### Task 5: Remove CI placeholder no longer needed

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Remove the service role placeholder**

In `.github/workflows/ci.yml`, remove this line from the `build` job env section:

```yaml
      SUPABASE_SERVICE_ROLE_KEY: placeholder-service-role-key
```

The `NEXT_PUBLIC_*` placeholders are still needed (they're used at build time by Next.js static analysis). Only `SUPABASE_SERVICE_ROLE_KEY` is no longer needed since the server client is never initialized during build.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: remove SUPABASE_SERVICE_ROLE_KEY placeholder (no longer needed after lazy init)"
```

---

### Task 6: Final verification

**Files:**
- No changes

- [ ] **Step 1: Full lint pass**

```bash
pnpm lint
```

Expected: zero errors. Fix any if found before proceeding.

- [ ] **Step 2: Full typecheck pass**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Verify no module-level Supabase initialization anywhere**

```bash
grep -rn "getSupabaseClient()\|getSupabaseAnonClient()" src --include="*.ts" | grep -v "function get\|??="
```

Expected: the only matches should be inside function bodies in `supabase-client.ts` itself and inside the `function get...()` bodies in `index.ts` and `server-services.ts`. If any match appears at module top level, fix it.

- [ ] **Step 4: Push branch**

```bash
git push -u origin refactor/lazy-service-locator
```

- [ ] **Step 5: Open PR**

Create PR: `refactor/lazy-service-locator` → `main`

Title: `refactor(db): lazy service locator — zero side effects on import`

Body:
```
## What
Converts the service locator in `src/core/infrastructure/database/index.ts` from eager module-level initialization to lazy singleton getter functions.

## Why
- Module imports now have zero side effects
- Unit tests can mock dependencies before any initialization occurs
- Removes the need for `SUPABASE_SERVICE_ROLE_KEY` placeholder in CI
- Foundation for adding tests to API routes

## How
- Every `export const xUseCase = new X(...)` → `export function getXUseCase(): X { return _x ??= new X(...) }`
- All 72+ call sites updated mechanically (import name + usage)
- `server-services.ts` follows the same lazy pattern
- No behavior change in production — singleton is created once on first call
```
