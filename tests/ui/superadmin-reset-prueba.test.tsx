import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResetPrueba } from '@/app/superadmin/reset-prueba';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: (...a: unknown[]) => fetchWithCsrf(...a) }));

const empresa = { empresaId: 'e1', nombre: 'La Casa de la Batería' };

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: /Resetear datos de prueba/ }));
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
  fetchWithCsrf.mockResolvedValue({
    ok: true,
    // Forma REAL de `handleResult`: los datos van sin envolver (ver successResponse).
    json: async () => ({ pedidos: 211, cobros: 68, turnos: 19, clientes: 1 }),
  });
});

describe('ResetPrueba (superadmin)', () => {
  it('explica qué se borra y qué se conserva', async () => {
    render(<ResetPrueba {...empresa} />);
    abrir();
    const aviso = await screen.findByRole('alertdialog');
    expect(aviso).toHaveTextContent(/pedidos, cobros del TPV, turnos de caja y clientes/);
    expect(aviso).toHaveTextContent(/catálogo, fotos, landing/);
  });

  it('no deja confirmar hasta escribir el nombre exacto de la empresa', async () => {
    render(<ResetPrueba {...empresa} />);
    abrir();
    const confirmar = await screen.findByRole('button', { name: 'Borrar datos' });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Escribe el nombre/), { target: { value: 'La Casa' } });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Escribe el nombre/), { target: { value: 'La Casa de la Batería' } });
    expect(confirmar).toBeEnabled();
    expect(fetchWithCsrf).not.toHaveBeenCalled();
  });

  it('al confirmar llama al endpoint y muestra lo borrado', async () => {
    render(<ResetPrueba {...empresa} />);
    abrir();
    fireEvent.change(await screen.findByLabelText(/Escribe el nombre/), { target: { value: 'La Casa de la Batería' } });
    fireEvent.click(screen.getByRole('button', { name: 'Borrar datos' }));

    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/superadmin/empresas/e1/reset-prueba');
    expect(init.method).toBe('POST');
    expect(await screen.findByRole('status')).toHaveTextContent('Borrados: 211 pedidos, 68 cobros, 19 turnos y 1 clientes');
  });

  it('si falla, avisa sin dar el borrado por hecho', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false, json: async () => ({ error: 'Error al resetear la empresa de prueba' }) });
    render(<ResetPrueba {...empresa} />);
    abrir();
    fireEvent.change(await screen.findByLabelText(/Escribe el nombre/), { target: { value: 'La Casa de la Batería' } });
    fireEvent.click(screen.getByRole('button', { name: 'Borrar datos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo resetear/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
