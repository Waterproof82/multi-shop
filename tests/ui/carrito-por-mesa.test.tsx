/**
 * useCarritoPorMesa — aislamiento del carrito por mesa (clase de bug de
 * facturación: los items de la mesa 3 NO pueden filtrarse a la mesa 7).
 *
 * Contrato congelado:
 *  - Al cambiar de mesaId se ejecuta clearCart() ANTES de que el gate deje
 *    montar el árbol de la mesa nueva (el sync de deferred vive en ese árbol,
 *    así que no puede correr con el carrito sucio).
 *  - grid → MISMA mesa: el carrito NO se limpia — el camarero puede volver
 *    sin perder la comanda a medias.
 *  - El «último mesaId visto» sobrevive al desmontaje de la página (vive a
 *    scope de módulo, la misma vida que el carrito en memoria del root layout).
 *
 * El CartProvider se mantiene VIVO entre navegaciones en cada test (rerender,
 * no unmount): así es en la app real, donde vive en el root layout.
 *
 * Import estático (no dinámico) a propósito: un `import()` dinámico tras
 * `vi.resetModules()` recarga `cart-context.tsx` como una instancia de
 * módulo distinta de la que usa el `<CartProvider>` de este archivo, así que
 * `useContext(CartContext)` deja de encontrar el provider. El estado de
 * módulo (`ultimaMesaVista`) compartido entre tests es inofensivo: limpiar
 * un carrito ya vacío al inicio de un test nuevo no cambia nada observable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { CartProvider, useCart } from '@/lib/cart-context';
import { useCarritoPorMesa } from '@/lib/mesa/carrito-por-mesa';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';

const PRODUCTO = {
  id: 'prod-1',
  title: 'Tortilla',
  price: 5,
} as unknown as MenuItemVM;

function Sonda({ mesaId }: Readonly<{ mesaId: string }>) {
  const listo = useCarritoPorMesa(mesaId);
  const { totalItems, addItem } = useCart();
  return (
    <div>
      <p data-testid="estado">{listo ? `listo:${mesaId}` : 'gate'}</p>
      <p data-testid="items">{totalItems}</p>
      <button type="button" onClick={() => addItem(PRODUCTO)}>add</button>
    </div>
  );
}

function Contador() {
  const { totalItems } = useCart();
  return <p data-testid="items-grid">{totalItems}</p>;
}

beforeEach(() => {
  cleanup();
});

describe('useCarritoPorMesa', () => {
  it('cambiar de mesa vacía el carrito y el gate no abre hasta estar limpio', async () => {
    const { rerender } = render(
      <CartProvider><Sonda mesaId="mesa-3" /></CartProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo:mesa-3'));
    screen.getByText('add').click();
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('1'));

    rerender(<CartProvider><Sonda mesaId="mesa-7" /></CartProvider>);
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo:mesa-7'));
    expect(screen.getByTestId('items').textContent).toBe('0');
  });

  it('grid → MISMA mesa: el carrito sobrevive (comanda a medias no se pierde)', async () => {
    const { rerender } = render(
      <CartProvider><Sonda mesaId="mesa-3" /></CartProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo:mesa-3'));
    screen.getByText('add').click();
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('1'));

    // Página de mesa desmontada (grid), CartProvider sigue vivo
    rerender(<CartProvider><Contador /></CartProvider>);
    expect(screen.getByTestId('items-grid').textContent).toBe('1');

    rerender(<CartProvider><Sonda mesaId="mesa-3" /></CartProvider>);
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo:mesa-3'));
    expect(screen.getByTestId('items').textContent).toBe('1');
  });

  it('grid → OTRA mesa: el «último visto» sobrevive al desmontaje y se vacía', async () => {
    const { rerender } = render(
      <CartProvider><Sonda mesaId="mesa-3" /></CartProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo:mesa-3'));
    screen.getByText('add').click();
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('1'));

    rerender(<CartProvider><Contador /></CartProvider>);

    rerender(<CartProvider><Sonda mesaId="mesa-7" /></CartProvider>);
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo:mesa-7'));
    expect(screen.getByTestId('items').textContent).toBe('0');
  });
});
