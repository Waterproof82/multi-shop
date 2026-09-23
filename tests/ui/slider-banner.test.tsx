import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { SliderBanner } from '@/components/slider-banner';

const slides = ['https://cdn.example.com/1.webp', 'https://cdn.example.com/2.webp', 'https://cdn.example.com/3.webp'];

function renderSlider(slidesArg: string[] = slides) {
  return render(
    <LanguageProvider>
      <SliderBanner slides={slidesArg} empresaNombre="La Mermelada" />
    </LanguageProvider>
  );
}

function activeDotIndex(): number {
  const dots = screen.getAllByRole('button', { name: /Ir a la imagen/ });
  return dots.findIndex((dot) => dot.querySelector('span')?.className.includes('bg-white') && !dot.querySelector('span')?.className.includes('bg-white/50'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SliderBanner', () => {
  it('no renderiza nada si no hay imágenes', () => {
    const { container } = renderSlider([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('arranca mostrando la primera imagen', () => {
    renderSlider();
    expect(activeDotIndex()).toBe(0);
  });

  it('avanza automáticamente cada 5 segundos', () => {
    renderSlider();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(activeDotIndex()).toBe(1);
  });

  it('se pausa con el mouse encima y se reanuda al salir', () => {
    renderSlider();
    const region = screen.getByTestId('slider-banner-root');

    fireEvent.mouseEnter(region);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(activeDotIndex()).toBe(0);

    fireEvent.mouseLeave(region);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(activeDotIndex()).toBe(1);
  });

  it('la flecha siguiente avanza una imagen manualmente', () => {
    renderSlider();

    fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente del banner' }));

    expect(activeDotIndex()).toBe(1);
  });

  it('no hace autoplay si el sistema tiene prefers-reduced-motion activo', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    renderSlider();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(activeDotIndex()).toBe(0);

    window.matchMedia = original;
  });
});
