/**
 * ProductoPage — guard de notFound()/permanentRedirect() (product-detail-pages PR3).
 *
 * El loader (`cargarPaginaProducto`) ya prueba, de forma pura, QUÉ entradas
 * colapsan a 'no-encontrado' — restaurante, host sin empresa, slug cruzado
 * de otro tenant, producto inactivo (ver tests/core/cargar-producto.test.ts).
 * Este test solo confirma que la PÁGINA traduce ese resultado en un 404 real
 * (spec PR3: restaurant regression guard / cross-tenant slug 404 / inactive
 * product 404 — las tres convergen aquí), y que el caso 'ok' no lanza.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const cargarPaginaProducto = vi.fn();
const getModalidadesEntregaPublicas = vi.fn();
const getContext = vi.fn();

vi.mock('@/lib/catalogo/cargar-producto', () => ({
  cargarPaginaProducto: (...args: unknown[]) => cargarPaginaProducto(...args),
}));

vi.mock('@/lib/server-services', () => ({
  getModalidadesEntregaPublicas: (...args: unknown[]) => getModalidadesEntregaPublicas(...args),
}));

vi.mock('@/core/infrastructure/database', () => ({
  getEmpresaLegalUseCase: () => ({ getContext: (...args: unknown[]) => getContext(...args) }),
}));

vi.mock('@/components/site-header-wrapper', () => ({
  default: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/components/producto/product-detail-client', () => ({
  ProductDetailClient: () => null,
}));

import ProductoPage, { generateMetadata } from '@/app/producto/[slug]/page';

function props(slug: string) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getModalidadesEntregaPublicas.mockResolvedValue([]);
  getContext.mockResolvedValue({
    success: true,
    data: { modalidadesDomicilio: [], legal: { plazoDesistimientoDias: 14 } },
  });
});

describe('ProductoPage', () => {
  it('no-encontrado → lanza notFound() (404), nunca una página en blanco silenciosa', async () => {
    cargarPaginaProducto.mockResolvedValue({ tipo: 'no-encontrado' });

    await expect(ProductoPage(props('cualquiera'))).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  });

  it('ok → resuelve sin lanzar y consulta el contexto legal de ESA empresa', async () => {
    cargarPaginaProducto.mockResolvedValue({
      tipo: 'ok',
      empresa: { id: 'e1', tipo: 'tienda', mostrarCarrito: true, moneda: 'EUR' },
      isPedidos: false,
      item: { id: 'p1', name: 'Kit básico', price: 24, category: 'kits', slug: 'kit-basico' },
      baseUrl: 'https://alma-de-arena.com',
    });

    await expect(ProductoPage(props('kit-basico'))).resolves.toBeTruthy();
    expect(getContext).toHaveBeenCalledWith('e1');
  });

  it('generateMetadata devuelve {} cuando el loader no resuelve ok (sin filtrar nada)', async () => {
    cargarPaginaProducto.mockResolvedValue({ tipo: 'no-encontrado' });

    expect(await generateMetadata(props('cualquiera'))).toEqual({});
  });
});
