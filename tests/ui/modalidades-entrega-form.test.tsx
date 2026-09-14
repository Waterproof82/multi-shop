import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalidadesEntregaForm } from '@/components/admin/ModalidadesEntregaForm';

const modalidadRecogida = {
  id: 'm1',
  tipo: 'recogida' as const,
  icono: 'store',
  nombre: 'Recogida rápida',
  precioCents: 0,
  tiempoMinMinutos: null,
  tiempoMaxMinutos: null,
  activo: true,
  orden: 0,
};

describe('ModalidadesEntregaForm', () => {
  it('el formulario de tipo recogida NO muestra campos de tiempo mínimo/máximo', () => {
    render(
      <ModalidadesEntregaForm
        tipo="recogida"
        modalidades={[modalidadRecogida]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/tiempo mínimo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tiempo máximo/i)).not.toBeInTheDocument();
  });

  it('el formulario de tipo domicilio SÍ muestra campos de tiempo mínimo y máximo', () => {
    render(
      <ModalidadesEntregaForm
        tipo="domicilio"
        modalidades={[]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/tiempo mínimo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo máximo/i)).toBeInTheDocument();
  });

  it('llama a onCreate con los datos del formulario al enviar', () => {
    const onCreate = vi.fn();
    render(
      <ModalidadesEntregaForm
        tipo="recogida"
        modalidades={[]}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Recogida express' },
    });
    fireEvent.change(screen.getByLabelText(/precio/i), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /añadir modalidad/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre_es: 'Recogida express',
        precioCents: 0,
      })
    );
  });
});
