/**
 * Interruptor de kits de caducidad en la tabla de empresas del superadmin
 * (mismo patrón que `delivery_habilitado`, ver empresas-table.tsx
 * `ModuloSwitch`). R-M4.1.2: solo el superadmin lo cambia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmpresasTable } from '@/app/superadmin/empresas-table';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: (...a: unknown[]) => fetchWithCsrf(...a) }));

const EMPRESA_BASE = {
  id: 'e1',
  nombre: 'Mermelada de Tomate',
  dominio: 'mermelada-tomate.es',
  tipo: 'tienda' as const,
  logoUrl: null,
  mostrarPromociones: true,
  mostrarTgtg: true,
  pagosMesaHabilitados: false,
  pagosPickupHabilitados: false,
  mesasHabilitadas: false,
  validacionPedidosHabilitada: false,
  deliveryHabilitado: true,
  googleReviewsUrl: null,
  stats: {
    totalPedidos: 0, pedidosPendientes: 0, totalClientes: 0, totalProductos: 0,
    pedidosHoy: 0, pedidosMes: 0, cuponesPromoValidados: 0, cuponesTgtgValidados: 0, cuponesTgtgTotales: 0,
  },
  totalMesas: 0,
  seoStatus: {
    hasDescription: true, hasLogo: true, hasUrlMapa: true, hasGeoCoordinates: true,
    hasFb: true, hasInstagram: true, hasMetaDescription: true,
  },
  landingHabilitada: true,
  tpvHabilitado: false,
  verifactuMode: null,
  esPrueba: false,
};

beforeEach(() => {
  fetchWithCsrf.mockReset();
  fetchWithCsrf.mockResolvedValue({ ok: true });
});

describe('EmpresasTable — interruptor de kits de caducidad', () => {
  it('muestra el interruptor apagado cuando el flag está desactivado', () => {
    render(<EmpresasTable empresas={[{ ...EMPRESA_BASE, kitsCaducidadHabilitado: false }]} />);

    const interruptor = screen.getByRole('switch', { name: /kits de caducidad/i });
    expect(interruptor).toHaveAttribute('aria-checked', 'false');
  });

  it('activarlo guarda kits_caducidad_habilitado: true vía PUT a la empresa', async () => {
    render(<EmpresasTable empresas={[{ ...EMPRESA_BASE, kitsCaducidadHabilitado: false }]} />);

    fireEvent.click(screen.getByRole('switch', { name: /kits de caducidad/i }));

    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/superadmin/empresas/e1');
    expect(JSON.parse(init.body as string)).toEqual({ kits_caducidad_habilitado: true });
  });

  it('si el guardado falla, el interruptor vuelve a su estado anterior', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false });
    render(<EmpresasTable empresas={[{ ...EMPRESA_BASE, kitsCaducidadHabilitado: false }]} />);

    const interruptor = screen.getByRole('switch', { name: /kits de caducidad/i });
    fireEvent.click(interruptor);

    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(interruptor).toHaveAttribute('aria-checked', 'false'));
  });
});
