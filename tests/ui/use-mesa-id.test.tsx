/**
 * useMesaId — dueño único de «¿en qué mesa estoy?».
 *
 * Precedencia con consecuencias reales:
 *  - El context (ruta /waiter/mesa/[mesaId], PR3) manda sobre el query param:
 *    si un camarero navega con un ?mesa= viejo en la URL, la mesa de la ruta
 *    es la verdad — mezclar ambas es la clase de bug que factura a otra mesa.
 *  - Sin context, el query param ?mesa= mantiene intacto el flujo QR del
 *    comensal.
 *  - Sin ninguno, null: el consumidor decide su propio fallback (p. ej.
 *    sessionStorage del camarero), no este hook.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MesaIdContext, useMesaId } from '@/lib/mesa/use-mesa-id';

function Probe() {
  const mesaId = useMesaId();
  return <p data-testid="mesa">{mesaId ?? 'null'}</p>;
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('useMesaId', () => {
  it('con MesaIdContext devuelve el valor del context aunque haya ?mesa= distinto en la URL', async () => {
    window.history.replaceState({}, '', '/?mesa=token-viejo');
    render(
      <MesaIdContext.Provider value="mesa-7">
        <Probe />
      </MesaIdContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('mesa').textContent).toBe('mesa-7'));
  });

  it('sin context cae al query param ?mesa= (flujo QR)', async () => {
    window.history.replaceState({}, '', '/?mesa=token-qr');
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('mesa').textContent).toBe('token-qr'));
  });

  it('sin context ni query param devuelve null', async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('mesa').textContent).toBe('null'));
  });
});
