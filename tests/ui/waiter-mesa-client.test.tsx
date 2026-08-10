/**
 * WaiterMesaClient — composición de la página de comanda del camarero.
 *
 * No reimplementa los tests de WaiterCatalogProvider ni de MenuPage (ya
 * cubiertos en sus propios archivos); prueba SOLO lo que esta pieza aporta:
 *  - `ensureCatalog()` se llama al montar (patrón lazy del provider).
 *  - Gate de carga: sin catálogo listo no se monta nada del árbol de mesa.
 *  - Estado de error explícito con reintento cuando el catálogo falla sin
 *    cache previa (el SW no ayuda: /api/* es NetworkOnly).
 *  - `MesaIdContext` llega de verdad a los hijos (vía el `useMesaId()` real,
 *    no un mock) — es la garantía de que la mesa de la ruta manda.
 *
 * `MenuPage` se sustituye por un doble que consume `useMesaId()` de verdad:
 * así la aserción prueba el cableado real del context, no la existencia de
 * un mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CartProvider } from '@/lib/cart-context';
import { LanguageProvider } from '@/lib/language-context';
import { useMesaId } from '@/lib/mesa/use-mesa-id';

const ensureCatalog = vi.fn();
const refresh = vi.fn();
let catalogState: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  empresa: { id: string; colores: null } | null;
  menuData: unknown[] | null;
};

vi.mock('@/lib/waiter-catalog-ctx', () => ({
  useWaiterCatalog: () => ({ ...catalogState, ensureCatalog, refresh }),
}));

vi.mock('@/components/client-menu-page', () => ({
  MenuPage: () => {
    const mesaId = useMesaId();
    return <p data-testid="menu-page-mesa">{mesaId}</p>;
  },
}));

vi.mock('@/components/site-header-client', () => ({
  SiteHeaderClient: () => <header data-testid="header" />,
}));

import { WaiterMesaClient } from '@/components/waiter-mesa-client';

function renderPage(mesaId = 'mesa-7') {
  return render(
    <LanguageProvider>
      <CartProvider>
        <WaiterMesaClient mesaId={mesaId} />
      </CartProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  ensureCatalog.mockClear();
  refresh.mockClear();
  catalogState = { status: 'idle', empresa: null, menuData: null };
});

describe('WaiterMesaClient', () => {
  it('llama ensureCatalog() al montar', () => {
    renderPage();
    expect(ensureCatalog).toHaveBeenCalledTimes(1);
  });

  it('sin catálogo listo, no monta el árbol de mesa (gate de carga)', () => {
    catalogState = { status: 'loading', empresa: null, menuData: null };
    renderPage();
    expect(screen.queryByTestId('menu-page-mesa')).not.toBeInTheDocument();
  });

  it('status error sin cache: muestra reintento y llama refresh() al pulsar', async () => {
    catalogState = { status: 'error', empresa: null, menuData: null };
    renderPage();
    const boton = await screen.findByRole('button');
    boton.click();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('menu-page-mesa')).not.toBeInTheDocument();
  });

  it('catálogo listo: MesaIdContext llega de verdad al árbol de mesa', async () => {
    catalogState = {
      status: 'ready',
      empresa: { id: 'emp-1', colores: null },
      menuData: [],
    };
    renderPage('mesa-42');
    await waitFor(() =>
      expect(screen.getByTestId('menu-page-mesa').textContent).toBe('mesa-42'),
    );
  });
});
