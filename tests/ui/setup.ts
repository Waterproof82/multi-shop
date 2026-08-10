/**
 * Arranque de los tests que montan componentes React.
 *
 * Solo lo carga el proyecto `ui` de `vitest.config.ts`; la suite `unit` sigue
 * en `node` sin pagar nada de esto.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  // Sin esto, cada test hereda el DOM del anterior y `getByRole` empieza a
  // encontrar dos botones donde deberia haber uno. El fallo aparece en el
  // SEGUNDO test, nunca en el que lo causa: es de los mas caros de depurar.
  cleanup();
  vi.clearAllMocks();
});

// jsdom no implementa `matchMedia`, y varios componentes de esta app la
// consultan al montar (temas, breakpoints). Sin este doble revientan con
// "matchMedia is not a function" antes de renderizar nada.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      // Heredadas de la API antigua: algunas librerias todavia las llaman.
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
}
