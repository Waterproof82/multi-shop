/**
 * WaiterCatalogProvider — cache en memoria del catalogo para el panel de
 * camarero.
 *
 * Tres comportamientos con consecuencias reales:
 *  - `ensureCatalog` debe ser idempotente: la pantalla de login por PIN monta
 *    el provider, pero no debe disparar ningun fetch hasta que alguien
 *    entre al panel y lo pida.
 *  - Un 401 limpia el estado en vez de dejar datos obsoletos servidos con
 *    una sesion que ya expiro.
 *  - Un fallo de red sin cache previa deja un estado de error explicito, no
 *    una pantalla en blanco silenciosa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { WaiterCatalogProvider, useWaiterCatalog } from '@/lib/waiter-catalog-ctx';

// El provider abre canales Realtime — stub del cliente anon singleton
vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseAnonClient: () => ({
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
    }),
    removeChannel: () => Promise.resolve(),
  }),
}));

const CATALOG_OK = {
  empresa: { id: 'emp-1', colores: null },
  menuData: [{ id: 'cat-1', items: [] }],
};

function Probe() {
  const { status, menuData, ensureCatalog } = useWaiterCatalog();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{menuData?.length ?? 'null'}</span>
      <button type="button" onClick={ensureCatalog}>ensure</button>
    </div>
  );
}

describe('WaiterCatalogProvider', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('ensureCatalog es idempotente: dos llamadas = un solo fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => CATALOG_OK,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WaiterCatalogProvider><Probe /></WaiterCatalogProvider>);
    await act(async () => {
      screen.getByText('ensure').click();
      screen.getByText('ensure').click();
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('401 limpia el estado (vuelve a idle, sin datos)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: 'No autorizado' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WaiterCatalogProvider><Probe /></WaiterCatalogProvider>);
    await act(async () => { screen.getByText('ensure').click(); });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'));
    expect(screen.getByTestId('count').textContent).toBe('null');
  });

  it('error de red sin cache previa deja status=error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));

    render(<WaiterCatalogProvider><Probe /></WaiterCatalogProvider>);
    await act(async () => { screen.getByText('ensure').click(); });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
  });
});
