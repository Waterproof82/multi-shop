import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { ModalidadesEntregaForm, type ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';

const modalidadDomicilio: ModalidadEntregaRow = {
  id: 'm1',
  tipo: 'domicilio',
  icono: 'bike',
  nombre: 'Envío estándar',
  precioCents: 350,
  tiempoMinMinutos: 30,
  tiempoMaxMinutos: 60,
  activo: true,
  orden: 0,
};

function renderForm(
  modalidades: ModalidadEntregaRow[] = [],
  onCreate = vi.fn(),
  onUpdate = vi.fn(),
  onDelete = vi.fn()
) {
  return render(
    <LanguageProvider>
      <ModalidadesEntregaForm
        modalidades={modalidades}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </LanguageProvider>
  );
}

describe('ModalidadesEntregaForm', () => {
  it('muestra los campos de precio, tiempo mínimo y tiempo máximo', () => {
    renderForm([]);
    expect(screen.getByLabelText(/precio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo mínimo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo máximo/i)).toBeInTheDocument();
  });

  it('llama a onCreate con precioCents, tiempoMinMinutos y tiempoMaxMinutos', () => {
    const onCreate = vi.fn();
    renderForm([], onCreate);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Envío estándar' },
    });
    fireEvent.change(screen.getByLabelText(/precio/i), {
      target: { value: '3.50' },
    });
    fireEvent.change(screen.getByLabelText(/tiempo mínimo/i), {
      target: { value: '120' },
    });
    fireEvent.change(screen.getByLabelText(/tiempo máximo/i), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByRole('button', { name: /añadir modalidad/i }));
    expect(onCreate).toHaveBeenCalledWith({
      tipo: 'domicilio',
      icono: 'store',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 120,
      tiempoMaxMinutos: 180,
    });
  });

  it('llama a onUpdate para alternar activo al hacer click en el botón de activar/desactivar', () => {
    const onUpdate = vi.fn();
    renderForm([modalidadDomicilio], vi.fn(), onUpdate);
    fireEvent.click(screen.getByRole('button', { name: /desactivar/i }));
    expect(onUpdate).toHaveBeenCalledWith('m1', { activo: false });
  });

  it('llama a onDelete al hacer click en el botón de borrar', () => {
    const onDelete = vi.fn();
    renderForm([modalidadDomicilio], vi.fn(), vi.fn(), onDelete);
    fireEvent.click(screen.getByRole('button', { name: /borrar modalidad/i }));
    expect(onDelete).toHaveBeenCalledWith('m1');
  });
});
