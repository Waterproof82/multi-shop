/**
 * resolverEmpresaPublica — pinning test (PR0 tenant-resolution, tarea 0.1).
 *
 * Fija el comportamiento ACTUAL antes de que carta-route.tsx deje de
 * duplicar esta misma lógica línea por línea y empiece a llamar a esta
 * función directamente (tarea 0.4). Cualquier cambio de comportamiento aquí
 * debe ser deliberado, no un efecto secundario del refactor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmpresaPublic } from '@/core/domain/entities/types';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: vi.fn((fn: unknown) => fn) }));

const findByDomainPublic = vi.fn();
vi.mock('@/core/infrastructure/database', () => ({
  getEmpresaPublicRepository: () => ({ findByDomainPublic }),
}));

import { resolverEmpresaPublica } from '@/lib/server-services';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return {
    id: 'empresa-1',
    nombre: 'Mi Sitio',
    dominio: 'misitio.com',
    tipo: 'tienda',
    mostrarCarrito: true,
    moneda: 'EUR',
    subdomainPedidos: 'pedidos',
    logoUrl: null,
    mostrarLogo: true,
    urlImage: null,
    bannerFit: 'contain',
    tipoBanner: 'imagen',
    bannerSlides: [],
    colores: null,
    descripcion: null,
    titulo: null,
    subtitulo: null,
    subtitulo2: null,
    footer1: null,
    footer2: null,
    fb: null,
    instagram: null,
    urlMapa: null,
    direccion: null,
    telefono: null,
    emailNotification: null,
    nif: null,
    razonSocial: null,
    descuentoBienvenidaActivo: false,
    descuentoBienvenidaPorcentaje: 0,
    descuentoBienvenidaDuracion: null,
    mesasHabilitadas: true,
    pagosPickupHabilitados: false,
    deliveryHabilitado: false,
    envioDomicilioHabilitado: false,
    landingHabilitada: true,
    googleReviewsUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  findByDomainPublic.mockReset();
});

describe('resolverEmpresaPublica', () => {
  it('coincidencia directa de dominio: devuelve la empresa e isPedidos=false', async () => {
    findByDomainPublic.mockResolvedValue({ success: true, data: empresa() });

    const resultado = await resolverEmpresaPublica('misitio.com');

    expect(findByDomainPublic).toHaveBeenCalledWith('misitio.com');
    expect(resultado).toEqual({ empresa: empresa(), isPedidos: false });
  });

  it('subdominio "pedidos." con configuración por defecto: resuelve la empresa principal e isPedidos=true', async () => {
    // `parseMainDomain` (domain-utils) ya recorta el prefijo "pedidos." antes
    // de llegar al repositorio, así que la PRIMERA llamada resuelve directo.
    findByDomainPublic.mockResolvedValue({ success: true, data: empresa() });

    const resultado = await resolverEmpresaPublica('pedidos.misitio.com');

    expect(findByDomainPublic).toHaveBeenCalledTimes(1);
    expect(findByDomainPublic).toHaveBeenCalledWith('misitio.com');
    expect(resultado).toEqual({ empresa: empresa(), isPedidos: true });
  });

  it('subdominio pedidos personalizado no literal "pedidos.": la empresa no se resuelve (limitación conocida)', async () => {
    // `subdomainPedidos` personalizado ("tienda") solo se conoce DESPUÉS de
    // encontrar la empresa, pero la primera búsqueda ya falla porque
    // `parseMainDomain` solo recorta el prefijo literal "pedidos.", así que
    // el fallback nunca llega a usar el valor personalizado configurado.
    findByDomainPublic.mockImplementation(async (domain: string) =>
      domain === 'misitio.com'
        ? { success: true, data: empresa({ subdomainPedidos: 'tienda' }) }
        : { success: true, data: null }
    );

    const resultado = await resolverEmpresaPublica('tienda.misitio.com');

    expect(findByDomainPublic).toHaveBeenCalledTimes(1);
    expect(findByDomainPublic).toHaveBeenCalledWith('tienda.misitio.com');
    expect(resultado).toEqual({ empresa: null, isPedidos: false });
  });

  it('dominio desconocido: devuelve empresa=null e isPedidos=false', async () => {
    findByDomainPublic.mockResolvedValue({ success: true, data: null });

    const resultado = await resolverEmpresaPublica('desconocido.com');

    expect(resultado).toEqual({ empresa: null, isPedidos: false });
  });
});
