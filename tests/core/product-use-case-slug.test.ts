/**
 * ProductUseCase — generación de slug (product-detail-pages PR1, tarea 1.4).
 *
 * Reglas bajo prueba: autogenerar SOLO cuando la empresa es tienda y el
 * slug viene vacío; nunca para restaurantes; reintento único ante 23505
 * (mapeado por el repo como UNIQUE_VIOLATION) y luego 409 CONFLICT.
 */
import { describe, it, expect, vi } from 'vitest';
import { ProductUseCase } from '@/core/application/use-cases/product.use-case';
import type { IProductRepository } from '@/core/domain/repositories/IProductRepository';
import type { Product } from '@/core/domain/entities/types';

function producto(overrides: Partial<Product> = {}): Product {
  return {
    id: 'producto-1',
    empresaId: 'empresa-1',
    categoriaId: null,
    titulo_es: 'Kit Básico',
    titulo_en: null,
    titulo_fr: null,
    titulo_it: null,
    titulo_de: null,
    descripcion_es: null,
    descripcion_en: null,
    descripcion_fr: null,
    descripcion_it: null,
    descripcion_de: null,
    precio: 10,
    fotoUrl: null,
    fotoUrl2: null,
    fotoObjectFit: null,
    esEspecial: false,
    activo: true,
    tipoProducto: 'comida',
    createdAt: new Date(),
    alergenos: [],
    tabla: null,
    slug: null,
    canonicalExterno: null,
    ...overrides,
  };
}

function repoStub(overrides: Partial<IProductRepository> = {}): IProductRepository {
  return {
    create: vi.fn().mockResolvedValue({ success: true, data: producto() }),
    findAllByTenant: vi.fn(),
    findByIds: vi.fn(),
    update: vi.fn().mockResolvedValue({ success: true, data: producto() }),
    delete: vi.fn(),
    findSlugsByPrefix: vi.fn().mockResolvedValue({ success: true, data: [] }),
    findSlugsHistoricosByPrefix: vi.fn().mockResolvedValue({ success: true, data: [] }),
    ...overrides,
  };
}

const baseData = {
  empresaId: 'empresa-1',
  titulo_es: 'Kit Básico',
  precio: 10,
} as Parameters<ProductUseCase['create']>[0];

describe('ProductUseCase.create — generación de slug', () => {
  it('tienda + slug vacío: genera el slug a partir del título y lo manda al repo', async () => {
    const repo = repoStub();
    const useCase = new ProductUseCase(repo);

    await useCase.create(baseData, true);

    expect(repo.findSlugsByPrefix).toHaveBeenCalledWith('empresa-1', 'kit-basico');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kit-basico' }));
  });

  it('aislamiento por tenant: findSlugsByPrefix se llama con el empresaId resuelto, no uno global', async () => {
    const repo = repoStub();
    const useCase = new ProductUseCase(repo);

    await useCase.create({ ...baseData, empresaId: 'empresa-2' }, true);

    expect(repo.findSlugsByPrefix).toHaveBeenCalledWith('empresa-2', 'kit-basico');
  });

  it('restaurante: nunca autogenera slug ni consulta colisiones', async () => {
    const repo = repoStub();
    const useCase = new ProductUseCase(repo);

    await useCase.create(baseData, false);

    expect(repo.findSlugsByPrefix).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(expect.not.objectContaining({ slug: expect.anything() }));
  });

  it('un slug explícito del admin no se sobrescribe', async () => {
    const repo = repoStub();
    const useCase = new ProductUseCase(repo);

    await useCase.create({ ...baseData, slug: 'kit-manual' }, true);

    expect(repo.findSlugsByPrefix).not.toHaveBeenCalled();
    expect(repo.findSlugsHistoricosByPrefix).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kit-manual' }));
  });

  it('un slug histórico (PR5) cuenta como ocupado: nunca se reasigna a un producto nuevo', async () => {
    const findSlugsByPrefix = vi.fn().mockResolvedValue({ success: true, data: [] });
    const findSlugsHistoricosByPrefix = vi.fn().mockResolvedValue({ success: true, data: ['kit-basico'] });
    const repo = repoStub({ findSlugsByPrefix, findSlugsHistoricosByPrefix });
    const useCase = new ProductUseCase(repo);

    await useCase.create(baseData, true);

    expect(findSlugsHistoricosByPrefix).toHaveBeenCalledWith('empresa-1', 'kit-basico');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kit-basico-2' }));
  });

  it('23505 en el primer intento: reintenta una vez con un slug libre y persiste ese resultado', async () => {
    const conflicto = { success: false as const, error: { code: 'UNIQUE_VIOLATION', message: 'slug en uso', module: 'repository' as const, method: 'create' } };
    const create = vi.fn()
      .mockResolvedValueOnce(conflicto)
      .mockResolvedValueOnce({ success: true, data: producto({ slug: 'kit-basico-2' }) });
    const findSlugsByPrefix = vi.fn()
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: ['kit-basico'] });
    const repo = repoStub({ create, findSlugsByPrefix });
    const useCase = new ProductUseCase(repo);

    const result = await useCase.create(baseData, true);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ slug: 'kit-basico-2' }));
    expect(result.success).toBe(true);
  });

  it('23505 persistente tras el reintento: devuelve CONFLICT sin un tercer intento', async () => {
    const conflicto = { success: false as const, error: { code: 'UNIQUE_VIOLATION', message: 'slug en uso', module: 'repository' as const, method: 'create' } };
    const create = vi.fn().mockResolvedValue(conflicto);
    const repo = repoStub({ create });
    const useCase = new ProductUseCase(repo);

    const result = await useCase.create(baseData, true);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('CONFLICT');
  });
});
