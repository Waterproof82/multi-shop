/**
 * Que datos se le piden a quien pide, y cuando.
 *
 * Esto vivia dentro de `CartDrawer` como un ternario con el formulario entero en
 * la rama negativa. Al sacarlo quedo a la vista que la condicion no es de
 * maquetacion: **en modo mesa no se recogen datos personales**, porque la mesa
 * ya identifica el pedido. Invertir esa condicion no rompe nada visible y pone
 * al proyecto a pedir nombre, telefono y correo a gente sentada en una mesa.
 *
 * Por eso el primer bloque de tests comprueba AUSENCIA de campos, que es lo que
 * ningun test de "se ve bien" comprueba nunca.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { DatosDelComensal } from '@/components/cart-drawer';

type Props = ComponentProps<typeof DatosDelComensal>;

const BASE: Props = {
  mesaToken: null,
  mesaInfo: null,
  mesaError: false,
  language: 'es',
  nombre: '',
  telefono: '',
  email: '',
  countryCode: '+34',
  errors: {},
  onNombre: () => {},
  onTelefono: () => {},
  onEmail: () => {},
  onCountryCode: () => {},
};

const pintar = (parcial: Partial<Props> = {}) =>
  render(<DatosDelComensal {...BASE} {...parcial} />);

describe('DatosDelComensal — en mesa no se piden datos personales', () => {
  it('con mesa NO pinta ningun campo de datos personales', () => {
    pintar({ mesaToken: 'tok-mesa-7', mesaInfo: { numero: 7, nombre: null } as Props['mesaInfo'] });

    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /nombre/i })).not.toBeInTheDocument();
    expect(document.querySelector('#cart-nombre')).toBeNull();
    expect(document.querySelector('#cart-telefono')).toBeNull();
    expect(document.querySelector('#cart-email')).toBeNull();
  });

  it('sin mesa SI pide nombre, telefono y correo', () => {
    pintar();

    expect(document.querySelector('#cart-nombre')).not.toBeNull();
    expect(document.querySelector('#cart-telefono')).not.toBeNull();
    expect(document.querySelector('#cart-email')).not.toBeNull();
  });

  it('el aviso de mesa no localizada se anuncia como alerta', () => {
    // `role="alert"` importa: sin el, quien usa lector de pantalla no se entera
    // de que la mesa no se ha reconocido y sigue creyendo que pide desde ella.
    pintar({ mesaToken: 'tok-roto', mesaError: true });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('sin error de mesa no hay alerta', () => {
    pintar({ mesaToken: 'tok-ok', mesaError: false });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DatosDelComensal — el telefono se limpia antes de salir del campo', () => {
  const escribir = (valor: string) => {
    const onTelefono = vi.fn();
    pintar({ onTelefono });
    fireEvent.change(document.querySelector('#cart-telefono') as HTMLElement, { target: { value: valor } });
    return onTelefono;
  };

  it('descarta todo lo que no sea digito', () => {
    // Pegar un numero copiado de WhatsApp trae espacios, guiones y prefijo.
    expect(escribir('+34 600-123 456')).toHaveBeenCalledWith('34600123456');
  });

  it('recorta a 15 digitos', () => {
    expect(escribir('1234567890123456789')).toHaveBeenCalledWith('123456789012345');
  });

  it('deja el campo vacio si no habia ningun digito', () => {
    expect(escribir('sin numeros')).toHaveBeenCalledWith('');
  });

  it('el tope tambien esta en el atributo, no solo en el handler', () => {
    pintar();
    expect((document.querySelector('#cart-telefono') as HTMLInputElement).maxLength).toBe(15);
  });
});

describe('DatosDelComensal — los errores llegan a lectores de pantalla', () => {
  it('marca el campo como invalido y lo enlaza con su mensaje', () => {
    pintar({ errors: { nombre: 'Falta el nombre' } });

    const input = document.querySelector('#cart-nombre') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'nombre-error');
  });

  it('sin error no enlaza nada', () => {
    pintar();

    const input = document.querySelector('#cart-nombre') as HTMLInputElement;
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('el telefono se marca igual', () => {
    pintar({ errors: { telefono: 'Telefono no valido' } });

    const input = document.querySelector('#cart-telefono') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'telefono-error');
  });

  it('el correo no bloquea el pedido: no admite estado de error', () => {
    // Es opcional a proposito — solo sirve para la promocion. Si algun dia se
    // valida, este test falla y obliga a decidirlo, en vez de que se cuele.
    pintar({ errors: { nombre: 'x', telefono: 'y' } });

    const input = document.querySelector('#cart-email') as HTMLInputElement;
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
