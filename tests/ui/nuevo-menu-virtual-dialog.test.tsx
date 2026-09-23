import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { NuevoMenuVirtualDialog } from '@/components/admin/NuevoMenuVirtualDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof NuevoMenuVirtualDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <LanguageProvider>
      <NuevoMenuVirtualDialog
        open
        esSubcategoria={false}
        saving={false}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        {...props}
      />
    </LanguageProvider>
  );
  return { onOpenChange, onConfirm };
}

describe('NuevoMenuVirtualDialog', () => {
  it('el botón Crear está deshabilitado con el nombre vacío', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /crear/i })).toBeDisabled();
  });

  it('llama a onConfirm con el nombre recortado al enviar', () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: '  Bebidas  ' } });
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));
    expect(onConfirm).toHaveBeenCalledWith('Bebidas');
  });

  it('no llama a onConfirm si el nombre es solo espacios', () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('muestra el título de subcategoría cuando esSubcategoria es true', () => {
    renderDialog({ esSubcategoria: true });
    expect(screen.getByText(/nueva subcategoría/i)).toBeInTheDocument();
  });

  it('cancelar llama a onOpenChange(false)', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
