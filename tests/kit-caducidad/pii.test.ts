import { describe, expect, it } from 'vitest';
import { enmascararEmail, enmascararTelefono } from '@/lib/kit-caducidad/pii';

// sdd kit-expiry-reminders M4d (docs/sdd/kit-expiry-reminders/m4/), R-M4.5.2/
// R-M4.5.3, DD12 de design.md: funciones puras usadas por el mapper del
// repositorio para que el email/telefono completos nunca salgan del
// repositorio en el listado (solo `findContacto` los devuelve enteros).

describe('enmascararEmail', () => {
  it('mantiene el dominio y oculta el usuario entre el primer y el último carácter', () => {
    expect(enmascararEmail('maria@example.com')).toBe('m***a@example.com');
  });

  it('un usuario de 2 caracteres solo muestra el primero', () => {
    expect(enmascararEmail('jo@example.com')).toBe('j*@example.com');
  });

  it('un usuario de 1 carácter se oculta por completo', () => {
    expect(enmascararEmail('a@example.com')).toBe('*@example.com');
  });

  it('devuelve null si no hay email registrado', () => {
    expect(enmascararEmail(null)).toBeNull();
  });
});

describe('enmascararTelefono', () => {
  it('oculta todo el número salvo los últimos 2 dígitos', () => {
    expect(enmascararTelefono('+34600123456')).toBe('**********56');
  });

  it('un teléfono de 2 caracteres u menos se oculta por completo', () => {
    expect(enmascararTelefono('12')).toBe('**');
  });

  it('devuelve null si no hay teléfono registrado', () => {
    expect(enmascararTelefono(null)).toBeNull();
  });
});
