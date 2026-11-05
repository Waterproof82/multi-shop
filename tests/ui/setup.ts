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

// jsdom tampoco implementa IntersectionObserver, y CategoryNav la usa para
// resaltar la categoría visible mientras se hace scroll. Sin este doble
// revienta con "IntersectionObserver is not defined" al montar — nunca se
// había topado nadie porque CategoryNav no tenía tests hasta ahora.
if (!window.IntersectionObserver) {
  class IntersectionObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverStub,
  });
}

// jsdom no implementa scrollIntoView. category-nav.tsx lo llama para mantener
// la pastilla activa visible dentro de la barra con scroll horizontal.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom no expone CSS.escape, que usar `instalarIdAnclaProducto` para montar un
// selector de atributo seguro con slugs arbitrarios. Escapar manualmente los
// caracteres no identificador, igual que hace la especificación.
if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
  (globalThis as unknown as { CSS: { escape: (value: string) => string } }).CSS = {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`),
  };
}
