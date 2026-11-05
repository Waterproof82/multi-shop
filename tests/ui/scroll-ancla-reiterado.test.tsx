import { describe, it, expect, beforeEach } from 'vitest';
import { intentarScrollAnclaReiteradamente, ATRIBUTO_ANCLA_PRODUCTO } from '@/lib/catalogo/ancla-producto';

/**
 * Por qué repite el scroll (y no un `scrollIntoView` de un solo intento): en
 * una recarga dura de /carta#producto-<slug>, el scroll nativo del navegador
 * falla (el SSR no pinta el `id` de la card) y el navegador RESTAURA su
 * posición guardada de forma asíncrona DESPUÉS de la carga — App Router de
 * Next 16 ya no fuerza `scrollRestoration = 'manual'` (solo lo traía el router
 * de pages). Un intento único en rAF puede quedar pisado por esa restauración
 * y el usuario aterriza arriba o donde sea, no en la card.
 *
 * El reintento — contra siempre el mismo objetivo, instantáneo — hace que el
 * ÚLTIMO intento gane sin saltos visibles. Se corta al primer gesto del
 * usuario y a los ~90 frames.
 */

interface RelojFalso {
  programar: (paso: () => void) => number;
  cancelar: (id: number) => void;
  readonly cancelados: number[];
  ejecutarSiguiente: () => void;
  pendientes: () => number;
}

function crearRelojFalso(): RelojFalso {
  const programados: Array<{ id: number; paso: () => void }> = [];
  const cancelados: number[] = [];
  let siguienteId = 0;
  return {
    programar: (paso) => {
      siguienteId += 1;
      programados.push({ id: siguienteId, paso });
      return siguienteId;
    },
    cancelar: (id) => {
      cancelados.push(id);
      // Igual que un rAF real: lo cancelado deja de estar agendado.
      const indice = programados.findIndex((p) => p.id === id);
      if (indice >= 0) programados.splice(indice, 1);
    },
    cancelados,
    ejecutarSiguiente: () => {
      programados.shift()?.paso();
    },
    pendientes: () => programados.length,
  };
}

function crearCard(slug: string): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute(ATRIBUTO_ANCLA_PRODUCTO, slug);
  document.body.appendChild(card);
  return card;
}

function irA(hash: string): void {
  window.location.hash = hash;
}

function llamadasScrollIntoView(): number {
  const stub = Element.prototype.scrollIntoView as unknown as { mock?: { calls: unknown[] } };
  return stub.mock?.calls.length ?? 0;
}

describe('intentarScrollAnclaReiteradamente', () => {
  beforeEach(() => {
    document.body.textContent = '';
    irA('');
  });

  it('hace el scroll en el primer frame cuando la card ya está montada', () => {
    crearCard('bateria-25ah');
    irA('#producto-bateria-25ah');
    const reloj = crearRelojFalso();

    intentarScrollAnclaReiteradamente(90, reloj);
    reloj.ejecutarSiguiente();

    expect(llamadasScrollIntoView()).toBe(1);
  });

  it('repite el scroll en frames sucesivos (el último gana sobre la restauración del navegador)', () => {
    crearCard('bateria-25ah');
    irA('#producto-bateria-25ah');
    const reloj = crearRelojFalso();

    intentarScrollAnclaReiteradamente(90, reloj);
    reloj.ejecutarSiguiente();
    reloj.ejecutarSiguiente();
    reloj.ejecutarSiguiente();

    expect(llamadasScrollIntoView()).toBe(3);
    expect(reloj.pendientes()).toBeGreaterThan(0);
  });

  it('se corta al primer gesto del usuario (wheel) y cancela lo agendado', () => {
    crearCard('bateria-25ah');
    irA('#producto-bateria-25ah');
    const reloj = crearRelojFalso();

    intentarScrollAnclaReiteradamente(90, reloj);
    reloj.ejecutarSiguiente();
    expect(reloj.pendientes()).toBe(1);

    window.dispatchEvent(new Event('wheel'));
    reloj.ejecutarSiguiente();

    expect(reloj.cancelados).toHaveLength(1);
    expect(llamadasScrollIntoView()).toBe(1);
  });

  it('deja de reintentar tras agotar maxFrames', () => {
    crearCard('bateria-25ah');
    irA('#producto-bateria-25ah');
    const reloj = crearRelojFalso();

    intentarScrollAnclaReiteradamente(3, reloj);
    for (let i = 0; i < 6; i += 1) reloj.ejecutarSiguiente();

    expect(llamadasScrollIntoView()).toBe(4); // frames 0..3 completos
    expect(reloj.pendientes()).toBe(0);
  });

  it('sin hash de producto no agenda nada', () => {
    crearCard('bateria-25ah');
    const reloj = crearRelojFalso();

    const cancelar = intentarScrollAnclaReiteradamente(90, reloj);

    expect(reloj.pendientes()).toBe(0);
    expect(cancelar).toBeTypeOf('function');
    cancelar();
    expect(llamadasScrollIntoView()).toBe(0);
  });

  it('si la card no está en el DOM aún no falla (RSC en commit posterior)', () => {
    irA('#producto-bateria-25ah');
    const reloj = crearRelojFalso();

    intentarScrollAnclaReiteradamente(90, reloj);

    expect(() => reloj.ejecutarSiguiente()).not.toThrow();
    expect(llamadasScrollIntoView()).toBe(0);
  });

  it('limpiar dos veces no revienta y la cancelación es idempotente', () => {
    crearCard('bateria-25ah');
    irA('#producto-bateria-25ah');
    const reloj = crearRelojFalso();

    const cancelar = intentarScrollAnclaReiteradamente(90, reloj);
    reloj.ejecutarSiguiente();
    cancelar();
    cancelar();

    expect(reloj.pendientes()).toBe(0);
  });
});
