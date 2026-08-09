/**
 * Primer test de componente del proyecto — y no es un "hola mundo" a proposito.
 *
 * Los alergenos no son decoracion: son informacion de seguridad alimentaria. Si
 * un distintivo deja de pintarse, alguien con alergia a los frutos secos no lo
 * ve. No hay error en consola, no falla ningun E2E, la carta se ve perfecta.
 *
 * Estos tests fijan el comportamiento ACTUAL (caracterizacion), incluido el que
 * no gusta: ver el caso del alergeno desconocido.
 */
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AllergenBadges } from '@/components/allergen-icons';

/** Los iconos son `<svg>` sin rol ni etiqueta, asi que se cuentan por elemento. */
function iconos(contenedor: HTMLElement): SVGSVGElement[] {
  return [...contenedor.querySelectorAll('svg')];
}

describe('AllergenBadges', () => {
  it('no pinta nada cuando el producto no declara alergenos', () => {
    const { container } = render(<AllergenBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no pinta nada cuando la lista viene vacia', () => {
    // Un array vacio NO es lo mismo que "sin datos", pero para el comensal si:
    // en ambos casos no hay nada que advertir.
    const { container } = render(<AllergenBadges alergenos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pinta un icono por cada alergeno declarado', () => {
    const { container } = render(
      <AllergenBadges alergenos={['gluten', 'peanuts', 'molluscs']} />,
    );
    expect(iconos(container)).toHaveLength(3);
  });

  it('DESCARTA EN SILENCIO un alergeno que no conoce', () => {
    // Comportamiento actual, documentado porque es el riesgo real de esta
    // pantalla: `AllergenIcon` devuelve `null` si la clave no esta en el mapa.
    // Un valor mal escrito en la BBDD ('cacahuetes' en vez de 'peanuts') no
    // rompe nada visible — simplemente la advertencia desaparece.
    const { container } = render(
      <AllergenBadges alergenos={['gluten', 'cacahuetes']} />,
    );

    expect(iconos(container)).toHaveLength(1);
    // Y el contenedor SIGUE ahi, asi que ni siquiera queda un hueco que delate
    // la perdida.
    expect(container.firstElementChild).not.toBeNull();
  });

  it('conserva la clase de quien llama sin perder las suyas', () => {
    const { container } = render(
      <AllergenBadges alergenos={['gluten']} className="mb-2" />,
    );

    const envoltorio = container.firstElementChild;
    expect(envoltorio).toHaveClass('flex', 'flex-wrap', 'gap-1', 'mb-2');
  });
});
