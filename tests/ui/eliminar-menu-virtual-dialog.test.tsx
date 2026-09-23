import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { EliminarMenuVirtualDialog } from '@/components/admin/EliminarMenuVirtualDialog';

describe('EliminarMenuVirtualDialog', () => {
  it('muestra el nombre del nodo a eliminar', () => {
    render(
      <LanguageProvider>
        <EliminarMenuVirtualDialog open nodoNombre="Bebidas" onOpenChange={vi.fn()} onConfirm={vi.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByText('Bebidas')).toBeInTheDocument();
  });

  it('confirmar llama a onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <LanguageProvider>
        <EliminarMenuVirtualDialog open nodoNombre="Bebidas" onOpenChange={vi.fn()} onConfirm={onConfirm} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancelar llama a onOpenChange(false), no a onConfirm', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <LanguageProvider>
        <EliminarMenuVirtualDialog open nodoNombre="Bebidas" onOpenChange={onOpenChange} onConfirm={onConfirm} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
