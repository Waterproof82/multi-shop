/**
 * Primer test de componente del proyecto — y no es un "hola mundo" a proposito.
 *
 * Los alergenos no son decoracion: son informacion de seguridad alimentaria. Si
 * un distintivo deja de pintarse, alguien con alergia a los frutos secos no lo
 * ve. No hay error en consola, no falla ningun E2E, la carta se ve perfecta.
 *
 * Se consulta por ROL Y NOMBRE ACCESIBLE, no contando `<svg>`. Contar elementos
 * diria que el icono esta en el DOM; esto comprueba lo que de verdad importa,
 * que es si la advertencia LLEGA a quien usa un lector de pantalla.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AllergenBadges, AllergenList } from '@/components/allergen-icons';

describe('AllergenBadges — el icono va solo, asi que debe hablar', () => {
  it('no pinta nada cuando el producto no declara alergenos', () => {
    const { container } = render(<AllergenBadges language="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no pinta nada cuando la lista viene vacia', () => {
    const { container } = render(<AllergenBadges alergenos={[]} language="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('cada alergeno se anuncia con su nombre traducido', () => {
    render(<AllergenBadges alergenos={['gluten', 'peanuts']} language="es" />);

    expect(screen.getByRole('img', { name: 'Cereales con gluten' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cacahuetes' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('respeta el idioma del comensal', () => {
    render(<AllergenBadges alergenos={['peanuts']} language="en" />);

    expect(screen.getByRole('img', { name: 'Peanuts' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Cacahuetes' })).not.toBeInTheDocument();
  });

  it('DESCARTA EN SILENCIO un alergeno que no conoce', () => {
    // Comportamiento actual, documentado porque es el riesgo real de esta
    // pantalla: `AllergenIcon` devuelve `null` si la clave no esta en el mapa.
    // Un valor mal escrito en la BBDD ('cacahuetes' en vez de 'peanuts') no
    // rompe nada visible — la advertencia simplemente desaparece.
    const { container } = render(
      <AllergenBadges alergenos={['gluten', 'no-existe']} language="es" />,
    );

    expect(screen.getAllByRole('img')).toHaveLength(1);
    // Y el contenedor SIGUE ahi, asi que ni siquiera queda un hueco que delate
    // la perdida.
    expect(container.firstElementChild).not.toBeNull();
  });

  it('conserva la clase de quien llama sin perder las suyas', () => {
    const { container } = render(
      <AllergenBadges alergenos={['gluten']} language="es" className="mb-2" />,
    );

    expect(container.firstElementChild).toHaveClass('flex', 'flex-wrap', 'gap-1', 'mb-2');
  });
});

describe('AllergenList — hay texto al lado, asi que el icono calla', () => {
  it('el nombre se lee UNA vez, no dos', () => {
    render(<AllergenList alergenos={['gluten']} language="es" />);

    // El texto visible es el que informa...
    expect(screen.getByText('Cereales con gluten')).toBeInTheDocument();
    // ...y el icono no vuelve a anunciarlo. Si alguien le pusiera `label`, un
    // lector de pantalla diria "Gluten, Gluten".
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('un alergeno desconocido SI aparece aqui, como texto crudo', () => {
    // Diferencia real con AllergenBadges, que lo descarta del todo: aqui el
    // icono falta pero el nombre se sigue viendo.
    render(<AllergenList alergenos={['no-existe']} language="es" />);

    expect(screen.getByText('no-existe')).toBeInTheDocument();
  });
});
