import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InterruptorTpv } from '@/app/superadmin/interruptor-tpv';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: (...a: unknown[]) => fetchWithCsrf(...a) }));

const conTpv = { empresaId: 'e1', nombre: 'Mermelada de Tomate', tpvHabilitado: true, verifactuMode: 'no-verifactu' };
const sinTpv = { empresaId: 'e2', nombre: 'La Casa de la Batería', tpvHabilitado: false, verifactuMode: null };

function interruptor() {
  return screen.getByRole('switch', { name: /TPV/ });
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
  fetchWithCsrf.mockResolvedValue({ ok: true });
});

describe('InterruptorTpv (tabla de empresas del superadmin)', () => {
  it('desactivar el TPV avisa de las consecuencias y NO guarda hasta confirmar', async () => {
    render(<InterruptorTpv {...conTpv} />);
    fireEvent.click(interruptor());
    const aviso = await screen.findByRole('alertdialog');
    expect(aviso).toHaveTextContent(/no podrán fichar ni cobrar/);
    // Consecuencia irreversible: el plazo de clientes baja de 5 a 3 años.
    expect(aviso).toHaveTextContent(/más de 3 años sin actividad se anonimizarán/);
    expect(aviso).toHaveTextContent('Programa externo (la web solo confirma pedidos)');
    expect(fetchWithCsrf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar TPV' }));
    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/superadmin/empresas/e1');
    expect(JSON.parse(init.body as string)).toEqual({ tpv_habilitado: false });
    await waitFor(() => expect(interruptor()).toHaveAttribute('aria-checked', 'false'));
  });

  it('activar el TPV también explica cómo afecta antes de guardar', async () => {
    render(<InterruptorTpv {...sinTpv} />);
    fireEvent.click(interruptor());
    const aviso = await screen.findByRole('alertdialog');
    expect(aviso).toHaveTextContent('Este sistema (TPV) · VeriFactu: sin configurar');
    expect(aviso).toHaveTextContent('Activo (dentro del TPV)');
    expect(aviso).toHaveTextContent('Se anonimizan a los 5 años sin actividad');
    expect(fetchWithCsrf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Activar TPV' }));
    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchWithCsrf.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ tpv_habilitado: true });
  });

  it('cancelar deja el TPV como estaba', async () => {
    render(<InterruptorTpv {...conTpv} />);
    fireEvent.click(interruptor());
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchWithCsrf).not.toHaveBeenCalled();
    expect(interruptor()).toHaveAttribute('aria-checked', 'true');
  });

  it('si el guardado falla, el interruptor vuelve a su estado y se avisa', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false });
    render(<InterruptorTpv {...sinTpv} />);
    fireEvent.click(interruptor());
    fireEvent.click(await screen.findByRole('button', { name: 'Activar TPV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo guardar/);
    expect(interruptor()).toHaveAttribute('aria-checked', 'false');
  });
});
