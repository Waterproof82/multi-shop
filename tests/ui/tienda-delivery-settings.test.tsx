import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TiendaDeliverySettings } from '@/components/admin/TiendaDeliverySettings';
import type { ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

const modalidadRecogida: ModalidadEntregaRow = {
  id: 'm1',
  tipo: 'recogida',
  icono: 'store',
  nombre: 'Recogida rápida',
  precioCents: 0,
  tiempoMinMinutos: null,
  tiempoMaxMinutos: null,
  activo: true,
  orden: 0,
};

const modalidadDomicilio: ModalidadEntregaRow = {
  id: 'm2',
  tipo: 'domicilio',
  icono: 'bike',
  nombre: 'Envío estándar',
  precioCents: 350,
  tiempoMinMinutos: 30,
  tiempoMaxMinutos: 60,
  activo: true,
  orden: 0,
};

function renderComponent(
  recogidaHabilitada: boolean,
  envioHabilitado: boolean,
  modalidadesIniciales: ModalidadEntregaRow[] = []
) {
  return render(
    <LanguageProvider>
      <TiendaDeliverySettings
        empresaId="empresa-1"
        recogidaHabilitada={recogidaHabilitada}
        envioHabilitado={envioHabilitado}
        modalidadesIniciales={modalidadesIniciales}
      />
    </LanguageProvider>
  );
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
});

describe('TiendaDeliverySettings', () => {
  it('no renderiza ningún ModalidadesEntregaForm si recogida y envío están deshabilitados', () => {
    renderComponent(false, false, [modalidadRecogida, modalidadDomicilio]);

    expect(screen.queryByRole('button', { name: /añadir modalidad/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Recogida rápida')).not.toBeInTheDocument();
    expect(screen.queryByText('Envío estándar')).not.toBeInTheDocument();
  });

  it('renderiza el ModalidadesEntregaForm de recogida cuando recogidaHabilitada es true', () => {
    renderComponent(true, false, [modalidadRecogida, modalidadDomicilio]);

    expect(screen.getByText('Recogida rápida')).toBeInTheDocument();
    expect(screen.queryByText('Envío estándar')).not.toBeInTheDocument();
  });

  it('renderiza el ModalidadesEntregaForm de domicilio cuando envioHabilitado es true', () => {
    renderComponent(false, true, [modalidadRecogida, modalidadDomicilio]);

    expect(screen.queryByText('Recogida rápida')).not.toBeInTheDocument();
    expect(screen.getByText('Envío estándar')).toBeInTheDocument();
  });

  it('togglear recogida llama a fetchWithCsrf con el PUT correcto', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true } as Response);
    renderComponent(false, false);

    const switchRecogida = screen.getByRole('switch', { name: /recogida en tienda/i });
    fireEvent.click(switchRecogida);

    await waitFor(() => {
      expect(fetchWithCsrf).toHaveBeenCalledWith('/api/admin/empresa', {
        method: 'PUT',
        body: JSON.stringify({ recogida_tienda_habilitada: true }),
      });
    });
  });

  it('revierte el switch y muestra error si el PUT falla', async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'No se pudo guardar' }),
    } as Response);
    renderComponent(false, false);

    const switchRecogida = screen.getByRole('switch', { name: /recogida en tienda/i });
    fireEvent.click(switchRecogida);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
    });
    expect(switchRecogida).toHaveAttribute('aria-checked', 'false');
  });
});
