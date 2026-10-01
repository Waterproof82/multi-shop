import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SeccionLegal } from '@/app/superadmin/seccion-legal';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: (...a: unknown[]) => fetchWithCsrf(...a) }));

const conTpv = { id: 'e1', nombre: 'Mermelada de Tomate', tpvHabilitado: true, verifactuMode: 'no-verifactu' };
const sinTpv = { id: 'e2', nombre: 'La Casa de la Batería', tpvHabilitado: false, verifactuMode: null };

function bloque(nombre: string) {
  return within(screen.getByRole('region', { name: nombre }));
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
  fetchWithCsrf.mockResolvedValue({ ok: true });
});

describe('SeccionLegal (superadmin)', () => {
  it('muestra el resumen legal de cada empresa según su TPV', () => {
    render(<SeccionLegal empresas={[conTpv, sinTpv]} />);
    expect(bloque('Mermelada de Tomate').getByText('Este sistema (TPV) · VeriFactu: no-verifactu')).toBeInTheDocument();
    expect(bloque('Mermelada de Tomate').getByText('Se anonimizan a los 5 años sin actividad')).toBeInTheDocument();
    expect(bloque('La Casa de la Batería').getByText('Programa externo (la web solo confirma pedidos)')).toBeInTheDocument();
    expect(bloque('La Casa de la Batería').getByText(/No disponible: si tiene empleados/)).toBeInTheDocument();
    expect(bloque('La Casa de la Batería').getByText('Se anonimizan a los 3 años sin actividad')).toBeInTheDocument();
  });

  it('desactivar el TPV pide confirmación y NO guarda hasta confirmar', async () => {
    render(<SeccionLegal empresas={[conTpv]} />);
    fireEvent.click(bloque('Mermelada de Tomate').getByRole('switch', { name: /TPV/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/no podrán fichar ni cobrar/);
    // Consecuencia irreversible: el plazo de clientes baja de 5 a 3 años.
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/más de 3 años sin actividad se anonimizarán/);
    expect(fetchWithCsrf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar TPV' }));
    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/superadmin/empresas/e1');
    expect(JSON.parse(init.body as string)).toEqual({ tpv_habilitado: false });
    await waitFor(() => expect(bloque('Mermelada de Tomate').getByText('Programa externo (la web solo confirma pedidos)')).toBeInTheDocument());
  });

  it('cancelar la confirmación deja el TPV como estaba', () => {
    render(<SeccionLegal empresas={[conTpv]} />);
    fireEvent.click(bloque('Mermelada de Tomate').getByRole('switch', { name: /TPV/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchWithCsrf).not.toHaveBeenCalled();
    expect(bloque('Mermelada de Tomate').getByRole('switch', { name: /TPV/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('activar el TPV guarda directamente, sin confirmación', async () => {
    render(<SeccionLegal empresas={[sinTpv]} />);
    fireEvent.click(bloque('La Casa de la Batería').getByRole('switch', { name: /TPV/ }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchWithCsrf.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ tpv_habilitado: true });
  });

  it('si el guardado falla, el interruptor vuelve a su estado y se avisa', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false });
    render(<SeccionLegal empresas={[sinTpv]} />);
    const sw = bloque('La Casa de la Batería').getByRole('switch', { name: /TPV/ });
    fireEvent.click(sw);
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo guardar/);
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});
