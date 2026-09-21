/**
 * getCachedMenu — no cachear un fallo transitorio del use-case.
 *
 * `unstable_cache` (Vercel Data Cache) solo se salta el cacheo si la función
 * envuelta LANZA — cachea igual cualquier valor que resuelva, incluido un
 * `{ error }` lógico. Sin el `throw` interno de `getCachedMenu`, un timeout
 * puntual de PostgREST en `GetMenuUseCase.execute` quedaba servido durante
 * los 3600s completos del `revalidate` a TODOS los dominios de la empresa —
 * la key de cache es `catalogTag(empresaId)`, no por dominio — ver Sentry
 * ca345ef3d53744ecb20dd05c7a578ed1 (mismo empresa_id, dominio distinto al
 * del fallo original 30min antes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock, unstableCacheMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  unstableCacheMock: vi.fn((fn: () => Promise<unknown>) => fn),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  unstable_cache: unstableCacheMock,
}));

vi.mock('@/core/application/use-cases/get-menu.use-case', () => ({
  // Arrow function: `new` no la puede invocar. `getMenuUseCase()` hace
  // `new GetMenuUseCase(...)`, así que el mock necesita ser "newable".
  GetMenuUseCase: vi.fn().mockImplementation(function GetMenuUseCase() {
    return { execute: executeMock };
  }),
}));

vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseAnonClient: vi.fn(),
}));

vi.mock('@/core/infrastructure/database/SupabaseProductRepository', () => ({
  SupabaseProductRepository: vi.fn(),
}));

vi.mock('@/core/infrastructure/database/SupabaseCategoryRepository', () => ({
  SupabaseCategoryRepository: vi.fn(),
}));

vi.mock('@/core/infrastructure/database', () => ({
  getEmpresaPublicRepository: vi.fn(),
  getComplementoGrupoRepository: vi.fn(),
  getMenuVirtualRepository: vi.fn(),
}));

import { getCachedMenu } from '@/lib/server-services';

beforeEach(() => {
  executeMock.mockReset();
  unstableCacheMock.mockClear();
});

describe('getCachedMenu — sin cacheo de fallos transitorios', () => {
  it('la función pasada a unstable_cache lanza cuando el use-case devuelve error', async () => {
    executeMock.mockResolvedValue({ error: 'Error al obtener categorías' });

    const resultado = await getCachedMenu('empresa-1');

    // El caller (page.tsx, api/waiter/catalog) sigue viendo el mismo shape
    // de siempre — el fix no cambia el contrato externo.
    expect(resultado).toEqual({ error: 'Error al obtener categorías' });

    // Pero unstable_cache recibió una función que LANZA ante ese error: Next
    // no persiste el fallo en la Data Cache.
    const wrappedFn = unstableCacheMock.mock.calls[0][0] as () => Promise<unknown>;
    await expect(wrappedFn()).rejects.toThrow('Error al obtener categorías');
  });

  it('un menú exitoso se devuelve tal cual y la función envuelta no lanza', async () => {
    executeMock.mockResolvedValue({ data: [] });

    const resultado = await getCachedMenu('empresa-1');

    expect(resultado).toEqual({ data: [] });

    const wrappedFn = unstableCacheMock.mock.calls[0][0] as () => Promise<unknown>;
    await expect(wrappedFn()).resolves.toEqual({ data: [] });
  });
});
