# Design: Lazy Service Locator Refactor

**Date:** 2026-07-13
**Status:** Approved
**Branch:** refactor/lazy-service-locator

## Problem

`src/core/infrastructure/database/index.ts` initializes ALL repositories and use cases at module evaluation time (lines 35-36 call `getSupabaseClient()` eagerly). Since 72+ files import from this module, any import triggers Supabase client creation — throwing `Error: Configuración de Supabase incompleta` when env vars are absent.

This causes:
- CI build failures without real env vars (worked around with hardcoded placeholders)
- Unit tests impossible: `jest.mock` can't intercept before the throw occurs
- Tight coupling: every API route initialization depends on Supabase being configured

## Goal

Convert the service locator from eager to lazy initialization so that:
1. Importing the module has no side effects
2. Supabase is only initialized on first actual use
3. Jest can mock dependencies before any initialization occurs
4. CI placeholders for `SUPABASE_SERVICE_ROLE_KEY` can be removed

## Non-Goals

- Full dependency injection framework
- Changing business logic or use case behavior
- Changing repository implementations
- Adding tests (this refactor enables them; writing them is a future task)

## Architecture

### Pattern: Lazy singleton via `??=`

```typescript
// Before
export const productUseCase = new ProductUseCase(new SupabaseProductRepository(supabase));

// After
let _productUseCase: ProductUseCase | undefined;
export function getProductUseCase(): ProductUseCase {
  return _productUseCase ??= new ProductUseCase(new SupabaseProductRepository(getSupabaseClient()));
}
```

The `??=` operator guarantees a single instance per Node.js process (singleton preserved). Supabase client is created only on first call.

### Files affected

| File | Change |
|---|---|
| `src/core/infrastructure/database/index.ts` | 14 module-level singletons → 14 lazy getter functions. Remove top-level `getSupabaseClient()` and `getSupabaseAnonClient()` calls. |
| `src/lib/server-services.ts` | Lines 14-16 (module-level anon client + repos) → lazy via getter function |
| 72 API routes + use case files | `import { xUseCase }` → `import { getXUseCase }`, `xUseCase.method()` → `getXUseCase().method()` |
| `.github/workflows/ci.yml` | Remove `SUPABASE_SERVICE_ROLE_KEY: placeholder-service-role-key` (no longer needed) |

### Naming convention

All getter functions follow the pattern `get{Name}()`:
- `productUseCase` → `getProductUseCase()`
- `categoryUseCase` → `getCategoryUseCase()`
- `pedidoRepository` (currently exported directly) → `getPedidoRepository()`
- etc.

### Testing enablement

After this change, mocking works correctly:

```typescript
jest.mock('@/core/infrastructure/database', () => ({
  getProductUseCase: jest.fn(() => ({
    getAll: jest.fn().mockResolvedValue({ success: true, data: [] })
  }))
}));
```

No Supabase initialization occurs during test setup.

## Rollout

Single branch, single PR. The change is purely mechanical — no logic changes. CI validates correctness.

## Risks

- **Missed call sites**: mitigated by using TypeScript as the rename tool. After renaming exports in `index.ts`, run `pnpm typecheck` — the compiler reports every broken import site exactly. No regex needed. Any exotic dynamic import pattern (`await import(...)`) will surface as a compile error.
- **`empresaRepository`, `pedidoRepository`, `mesaRepository`, `mesaSesionRepository`, `valoracionRepository`, `empleadoTpvRepository`, `complementoGrupoRepository`, `empresaPublicRepository`**: these are currently exported as `const` (not use cases). They follow the same lazy pattern.
- **Sync-only**: the `??=` pattern requires synchronous initialization. `getSupabaseClient()` reads `process.env` and calls `createClient()` synchronously — no async secrets manager involved. If that ever changes, this pattern needs revisiting.

## Testing patterns enabled

**Integration test (API route):** mock the entire module
```typescript
jest.mock('@/core/infrastructure/database', () => ({
  getProductUseCase: jest.fn(() => ({ getAll: jest.fn().mockResolvedValue({ success: true, data: [] }) }))
}));
```

**Unit test (Use Case with fake repo):** mock only the repository getter
```typescript
jest.mock('@/core/infrastructure/database', () => ({
  getProductRepository: jest.fn(() => ({ findAll: jest.fn().mockResolvedValue([]) }))
}));
// Then test the real ProductUseCase with the mocked repo
```

This granularity was impossible before — the module threw on import before any mock could take effect.
