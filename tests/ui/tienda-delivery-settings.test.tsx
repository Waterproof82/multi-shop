import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TiendaDeliverySettings } from '@/components/admin/TiendaDeliverySettings';
import type { ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

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
  envioHabilitado: boolean,
  modalidadesIniciales: ModalidadEntregaRow[] = []
) {
  return render(
    <LanguageProvider>
      <TiendaDeliverySettings
        empresaId="empresa-1"
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
  it('no renderiza el ModalidadesEntregaForm si envío está deshabilitado', () => {
    renderComponent(false, [modalidadDomicilio]);

    expect(screen.queryByRole('button', { name: /añadir modalidad/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Envío estándar')).not.toBeInTheDocument();
  });

  it('renderiza el ModalidadesEntregaForm cuando envioHabilitado es true', () => {
    renderComponent(true, [modalidadDomicilio]);

    expect(screen.getByText('Envío estándar')).toBeInTheDocument();
  });

  it('togglear envío llama a fetchWithCsrf con el PUT correcto', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true } as Response);
    renderComponent(false);

    const switchEnvio = screen.getByRole('switch', { name: /envío a domicilio/i });
    fireEvent.click(switchEnvio);

    await waitFor(() => {
      expect(fetchWithCsrf).toHaveBeenCalledWith('/api/admin/empresa', {
        method: 'PUT',
        body: JSON.stringify({ envio_domicilio_habilitado: true }),
      });
    });
  });

  it('revierte el switch y muestra error si el PUT falla', async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'No se pudo guardar' }),
    } as Response);
    renderComponent(false);

    const switchEnvio = screen.getByRole('switch', { name: /envío a domicilio/i });
    fireEvent.click(switchEnvio);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
    });
    expect(switchEnvio).toHaveAttribute('aria-checked', 'false');
  });
});
