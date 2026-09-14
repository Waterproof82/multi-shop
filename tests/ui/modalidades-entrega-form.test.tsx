import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
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

function renderForm(
  tipo: 'recogida' | 'domicilio',
  modalidades: any[] = [],
  onCreate = vi.fn(),
  onUpdate = vi.fn(),
  onDelete = vi.fn()
) {
  return render(
    <LanguageProvider>
      <ModalidadesEntregaForm
        tipo={tipo}
        modalidades={modalidades}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </LanguageProvider>
  );
}

describe('ModalidadesEntregaForm', () => {
  it('el formulario de tipo recogida NO muestra campos de tiempo mínimo/máximo', () => {
    renderForm('recogida', [modalidadRecogida]);
    expect(screen.queryByLabelText(/tiempo mínimo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tiempo máximo/i)).not.toBeInTheDocument();
  });

  it('el formulario de tipo domicilio SÍ muestra campos de tiempo mínimo y máximo', () => {
    renderForm('domicilio', []);
    expect(screen.getByLabelText(/tiempo mínimo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo máximo/i)).toBeInTheDocument();
  });

  it('llama a onCreate con los datos del formulario al enviar', () => {
    const onCreate = vi.fn();
    renderForm('recogida', [], onCreate);
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

  it('llama a onCreate con tiempoMinMinutos y tiempoMaxMinutos cuando tipo es domicilio', () => {
    const onCreate = vi.fn();
    renderForm('domicilio', [], onCreate);
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
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre_es: 'Envío estándar',
        precioCents: 350,
        tiempoMinMinutos: 120,
        tiempoMaxMinutos: 180,
      })
    );
  });
});
