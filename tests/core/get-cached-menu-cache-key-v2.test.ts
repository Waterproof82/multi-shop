/**
 * getCachedMenu — bump de la cache key (product-detail-pages PR2, decisión 6).
 *
 * La Vercel Data Cache sobrevive a los deploys: un VM ya cacheado SIN
 * `slug`/`canonicalExterno` (código pre-PR2) seguiría devolviéndose durante
 * hasta 3600s tras desplegar PR2, haciendo 404 todas las páginas de
 * producto hasta que expire o se revalide manualmente. Añadir un sufijo de
 * versión a la key fuerza un cache miss limpio en el primer deploy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock, unstableCacheMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  unstableCacheMock: vi.fn((fn: () => Promise<unknown>, _keyParts?: string[], _options?: unknown) => fn),
}));

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  unstable_cache: unstableCacheMock,
}));

vi.mock('@/core/application/use-cases/get-menu.use-case', () => ({
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
import { catalogTag } from '@/lib/cache-tags';

beforeEach(() => {
  executeMock.mockReset();
  unstableCacheMock.mockClear();
});

describe('getCachedMenu — cache key versionada tras añadir slug/canonicalExterno al VM', () => {
  it('la key pasada a unstable_cache incluye el sufijo vm-v2', async () => {
    executeMock.mockResolvedValue({ data: [] });

    await getCachedMenu('empresa-1');

    expect(unstableCacheMock.mock.calls[0][1]).toEqual([catalogTag('empresa-1'), 'vm-v2']);
  });
});
