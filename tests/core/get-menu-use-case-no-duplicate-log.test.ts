/**
 * GetMenuUseCase.execute — no duplicar el log de un fallo ya logueado.
 *
 * Cuando `productRepo.findAllByTenant` o `categoryRepo.findAllByTenant`
 * fallan, el REPOSITORIO ya loguea el error con su propio código (p. ej.
 * `DB_SELECT_ERROR`) antes de devolver el `Result` fallido — ver
 * `SupabaseProductRepository.findAllByTenant` /
 * `SupabaseCategoryRepository.findAllByTenant`. El use case volvía a
 * loguearlo una segunda vez bajo `USE_CASE_ERROR`: un solo fallo de DB
 * generaba dos eventos en Sentry para el mismo incidente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMenuUseCase } from '@/core/application/use-cases/get-menu.use-case';
import type { IProductRepository } from '@/core/domain/repositories/IProductRepository';
import type { ICategoryRepository } from '@/core/domain/repositories/ICategoryRepository';
import type { IComplementoGrupoRepository } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { IMenuVirtualRepository, MenuVirtualProductoAsignacion } from '@/core/domain/repositories/IMenuVirtualRepository';
import type { Product, Category, MenuVirtual } from '@/core/domain/entities/types';

const { logAndReturnErrorMock } = vi.hoisted(() => ({
  logAndReturnErrorMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: logAndReturnErrorMock, logFromCatch: vi.fn().mockResolvedValue({ message: 'boom' }) },
}));

const dbErrorResult = {
  success: false as const,
  error: { code: 'DB_ERROR', message: 'Error al obtener productos', module: 'repository' as const, method: 'findAllByTenant' },
};

function useCaseConProductRepoFallando(): GetMenuUseCase {
  const productRepo = { findAllByTenant: vi.fn().mockResolvedValue(dbErrorResult) } as unknown as IProductRepository;
  const categoryRepo = { findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [] }) } as unknown as ICategoryRepository;
  const complementoRepo = {} as IComplementoGrupoRepository;
  const menuVirtualRepo = {} as IMenuVirtualRepository;
  return new GetMenuUseCase(productRepo, categoryRepo, complementoRepo, menuVirtualRepo);
}

beforeEach(() => {
  logAndReturnErrorMock.mockClear();
});

describe('GetMenuUseCase.execute — sin doble log', () => {
  it('cuando el repositorio falla, el use-case NO vuelve a loguear (el repo ya lo hizo)', async () => {
    const useCase = useCaseConProductRepoFallando();

    const resultado = await useCase.execute('empresa-1');

    expect(resultado.error).toBe('Error al obtener productos');
    expect(logAndReturnErrorMock).not.toHaveBeenCalled();
  });
});

/**
 * GetMenuUseCase.execute — orquestación de menús virtuales.
 *
 * `construirMenusVirtuales` es el único punto de cableado en producción entre
 * el repo y `MenuMapper.toVirtualCategoryVM`: nada más ejercita que
 * `asignacionesPorNodo`/`productosPorId`/`categoriasPorId`/`hijosPorPadre` se
 * arman bien, ni que `execute()` mezcla el resultado en el array final.
 * `menu-virtual-mapper.test.ts` solo cubre el mapper puro, aislado.
 */
const producto1: Product = {
  id: 'prod-1',
  empresaId: 'empresa-1',
  categoriaId: 'cat-1',
  titulo_es: 'Hamburguesa',
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
  fotoObjectFit: null,
  esEspecial: false,
  activo: true,
  tipoProducto: 'comida',
  createdAt: new Date('2026-01-01'),
  alergenos: [],
  tabla: null,
};

const categoria1: Category = {
  id: 'cat-1',
  empresaId: 'empresa-1',
  nombre: 'Comida',
  descripcion: null,
  orden: 0,
  tipoProducto: 'comida',
  categoriaComplementoDe: null,
  complementoObligatorio: false,
  categoriaPadreId: null,
};

const menuVirtualPadre: MenuVirtual = {
  id: 'mv-padre',
  empresaId: 'empresa-1',
  padreId: null,
  nombre: 'Vehículos',
  orden: 0,
};

const menuVirtualHijo: MenuVirtual = {
  id: 'mv-hijo',
  empresaId: 'empresa-1',
  padreId: 'mv-padre',
  nombre: 'Coches',
  orden: 0,
};

// Mismo producto que la categoría real "Comida" — a propósito, para probar
// que un menú virtual NO fuerza dedup entre menús (parte central de la
// funcionalidad: el mismo producto puede navegarse por dos caminos).
const asignacionVirtual: MenuVirtualProductoAsignacion = {
  menuVirtualId: 'mv-hijo',
  productoId: 'prod-1',
};

function useCaseConMenusVirtuales(menuVirtualRepoOverrides: Partial<IMenuVirtualRepository>): GetMenuUseCase {
  const productRepo = {
    findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [producto1] }),
  } as unknown as IProductRepository;
  const categoryRepo = {
    findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [categoria1] }),
  } as unknown as ICategoryRepository;
  const complementoRepo = {
    findAssignmentsByProductos: vi.fn().mockResolvedValue({ success: true, data: [] }),
    findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [] }),
  } as unknown as IComplementoGrupoRepository;
  const menuVirtualRepo = { ...menuVirtualRepoOverrides } as unknown as IMenuVirtualRepository;

  return new GetMenuUseCase(productRepo, categoryRepo, complementoRepo, menuVirtualRepo);
}

describe('GetMenuUseCase.execute — orquestación de menús virtuales', () => {
  it('cablea asignaciones/productos/categorías al mapper y anexa el menú virtual DESPUÉS de las categorías reales', async () => {
    const useCase = useCaseConMenusVirtuales({
      findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [menuVirtualPadre, menuVirtualHijo] }),
      findAsignacionesByTenant: vi.fn().mockResolvedValue({ success: true, data: [asignacionVirtual] }),
    });

    const resultado = await useCase.execute('empresa-1');

    expect(resultado.error).toBeUndefined();
    const data = resultado.data!;
    expect(data).toHaveLength(2);

    // Categoría real primero, en el orden de `[...menu, ...menuVirtualVMs]`.
    expect(data[0].id).toBe('category-cat-1');
    expect(data[0].items.map((item) => item.id)).toEqual(['prod-1']);

    // Menú virtual después, con subcategorías/items poblados desde las
    // asignaciones mockeadas.
    const virtual = data[1];
    expect(virtual.id).toBe('mv-padre');
    expect(virtual.label).toBe('Vehículos');
    expect(virtual.subcategories).toHaveLength(1);
    expect(virtual.subcategories?.[0]?.id).toBe('mv-hijo');
    expect(virtual.subcategories?.[0]?.products.map((p) => p.id)).toEqual(['prod-1']);
    expect(virtual.items.map((item) => item.id)).toEqual(['prod-1']);

    // El mismo producto aparece en la categoría real Y en el menú virtual —
    // sin dedup forzado entre menús.
    expect(data[0].items[0]?.id).toBe(virtual.items[0]?.id);
  });

  it('degrada con gracia: si el repo de menús virtuales falla, la carta real se sirve igual sin menús virtuales', async () => {
    const useCase = useCaseConMenusVirtuales({
      findAllByTenant: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'boom', module: 'repository' as const, method: 'findAllByTenant' },
      }),
      findAsignacionesByTenant: vi.fn().mockResolvedValue({ success: true, data: [] }),
    });

    const resultado = await useCase.execute('empresa-1');

    expect(resultado.error).toBeUndefined();
    const data = resultado.data!;
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('category-cat-1');
    expect(data.some((categoria) => categoria.id === 'mv-padre')).toBe(false);
  });
});
