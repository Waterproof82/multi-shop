/**
 * Campo "Piso, puerta, escalera" en envíos a domicilio.
 *
 * Mapbox encuentra el portal pero no la vivienda. Sin este campo el pedido
 * llegaba al repartidor como "Calle X 57" en un edificio de 50 puertas.
 * Se prueba con el buscador de Mapbox sustituido por un botón: aquí interesa
 * qué hace el carrito con la dirección elegida, no la API de Mapbox.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CartDrawer } from '@/components/cart-drawer';
import { CartProvider, useCart } from '@/lib/cart-context';
import { LanguageProvider } from '@/lib/language-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const DIRECCION_MAPBOX = 'Calle Medico Ernesto Castro 57, 38356 Tacoronte, Santa Cruz de Tenerife, España';

vi.mock('@/components/MapboxAddressInput', () => ({
  MapboxAddressInput: ({ onSelect }: { onSelect: (a: { address: string; latitude: number; longitude: number; postalCode: string }) => void }) => (
    <button type="button" onClick={() => onSelect({ address: DIRECCION_MAPBOX, latitude: 28.5, longitude: -16.4, postalCode: '38356' })}>
      elegir-direccion
    </button>
  ),
}));

const ITEM: MenuItemVM = { id: 'prod-1', name: 'Producto de prueba', price: 10, category: 'cat-1' };
const DOMICILIO: ModalidadEntregaPublica = {
  id: '11111111-1111-4111-8111-111111111111', tipo: 'domicilio', icono: '🚲', nombre: 'Envío exprés', precioCents: 150,
  tiempoMinMinutos: null, tiempoMaxMinutos: null, activo: true, orden: 0,
};

function SembrarCarritoAbierto({ children }: Readonly<{ children: ReactNode }>) {
  const { addItem, openCart } = useCart();
  useEffect(() => {
    addItem(ITEM, 1);
    openCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function pintarCheckoutDomicilio() {
  render(
    <LanguageProvider>
      <CartProvider>
        <SembrarCarritoAbierto>
          <CartDrawer isRestaurant={false} envioDomicilioHabilitado modalidadesEntrega={[DOMICILIO]} />
        </SembrarCarritoAbierto>
      </CartProvider>
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
  fireEvent.click(screen.getByRole('button', { name: /envío exprés/i }));
}

const campoDetalle = () => screen.queryByLabelText(/piso, puerta, escalera/i);

afterEach(() => vi.unstubAllGlobals());

describe('Carrito — piso y puerta en envíos a domicilio', () => {
  it('el campo no aparece hasta elegir la dirección', () => {
    pintarCheckoutDomicilio();
    expect(campoDetalle()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'elegir-direccion' }));
    expect(campoDetalle()).not.toBeNull();
  });

  it('en recogida no se pide', () => {
    pintarCheckoutDomicilio();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-direccion' }));
    fireEvent.click(screen.getByRole('button', { name: /recoger en local/i }));
    expect(campoDetalle()).toBeNull();
  });

  it('el pedido sale con la puerta incrustada tras calle y número', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: 'x' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    pintarCheckoutDomicilio();
    fireEvent.click(screen.getByRole('button', { name: 'elegir-direccion' }));
    fireEvent.change(campoDetalle() as HTMLElement, { target: { value: 'Puerta 501' } });
    fireEvent.change(document.querySelector('#cart-nombre') as HTMLElement, { target: { value: 'Ana' } });
    fireEvent.change(document.querySelector('#cart-telefono') as HTMLElement, { target: { value: '600123123' } });
    fireEvent.change(document.querySelector('#cart-email') as HTMLElement, { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByLabelText(/14 años/));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Pedido' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const llamada = fetchMock.mock.calls.find((c) => c[0] === '/api/pedidos') as [string, RequestInit];
    const body = JSON.parse(String(llamada[1].body)) as Record<string, unknown>;
    expect(body.direccion_entrega).toBe(
      'Calle Medico Ernesto Castro 57, Puerta 501, 38356 Tacoronte, Santa Cruz de Tenerife, España',
    );
  });
});
