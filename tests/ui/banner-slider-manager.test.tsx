import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { BannerSliderManager } from '@/components/admin/banner-slider-manager';

// Se mockea el boundary de subida real: BannerSliderManager no es responsable
// de optimizar/subir archivos, solo de gestionar el array de URLs.
vi.mock('@/components/ui/image-uploader', () => ({
  ImageUploader: ({ value, onChange }: { value: string; onChange: (url: string) => void }) => (
    value ? (
      <div data-testid="slide-thumb">
        <span>{value}</span>
        <button type="button" onClick={() => onChange('')}>Eliminar</button>
        <button type="button" onClick={() => onChange('https://cdn.example.com/reemplazada.webp')}>Cambiar</button>
      </div>
    ) : (
      <button type="button" onClick={() => onChange('https://cdn.example.com/nueva.webp')}>Agregar</button>
    )
  ),
}));

function renderManager(slides: string[], onChange = vi.fn()) {
  render(
    <LanguageProvider>
      <BannerSliderManager slides={slides} onChange={onChange} />
    </LanguageProvider>
  );
  return onChange;
}

// El reordenamiento por drag-and-drop (@dnd-kit) no se testea aquí: simular
// eventos de puntero contra @dnd-kit en RTL es frágil y de bajo valor —
// arrayMove() es una función de librería ya probada. Se verifica a mano.
describe('BannerSliderManager', () => {
  it('muestra el slot de agregar cuando hay menos de 5 imágenes', () => {
    renderManager(['https://cdn.example.com/a.webp']);

    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
  });

  it('al agregar una imagen, llama onChange con el array actualizado', () => {
    const onChange = renderManager(['https://cdn.example.com/a.webp']);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onChange).toHaveBeenCalledWith([
      'https://cdn.example.com/a.webp',
      'https://cdn.example.com/nueva.webp',
    ]);
  });

  it('con 5 imágenes, oculta el slot de agregar y muestra el mensaje de máximo', () => {
    const cinco = Array.from({ length: 5 }, (_, i) => `https://cdn.example.com/${i}.webp`);
    renderManager(cinco);

    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
    expect(screen.getByText('Máximo 5 imágenes')).toBeInTheDocument();
  });

  it('al eliminar una imagen, llama onChange sin ella', () => {
    const onChange = renderManager(['https://cdn.example.com/a.webp', 'https://cdn.example.com/b.webp']);

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);

    expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/b.webp']);
  });

  it('al cambiar una imagen, llama onChange con la URL nueva en la misma posición', () => {
    const onChange = renderManager(['https://cdn.example.com/a.webp', 'https://cdn.example.com/b.webp']);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar' })[0]);

    expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/reemplazada.webp', 'https://cdn.example.com/b.webp']);
  });
});
