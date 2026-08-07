/**
 * Fusión de fichas de cliente.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `ClienteUseCase.createOrUpdate` tenía dos bloques casi idénticos —buscar por
 * teléfono, buscar por email— y en cada uno se recomponía a mano qué campos
 * conservar. Esa recomposición es la que decide si actualizar una ficha o
 * MACHACARLA.
 *
 * El caso concreto: un pedido de mesa no trae dirección. Sin el `??`, guardar
 * ese pedido le borraría la dirección a un cliente que sí la tenía — y con ella
 * la posibilidad de mandarle un reparto. Es pérdida de datos silenciosa, del
 * tipo que solo se descubre cuando alguien pide a domicilio y no llega.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: vi.fn(), logFromCatch: vi.fn() },
}));

import { fusionarCliente } from '../../src/core/application/use-cases/cliente.use-case';
import type { Cliente } from '../../src/core/domain/entities/types';

const existente = {
  id: 'c1',
  nombre: 'Ana Pérez',
  email: 'ana@ejemplo.com',
  telefono: '600111222',
  direccion: 'Calle Mayor 1',
} as Cliente;

describe('lo que no viene se conserva', () => {
  it('un alta sin dirección NO borra la que ya había', () => {
    const fusion = fusionarCliente({ nombre: 'Ana P.', telefono: '600111222' }, existente);

    expect(fusion.direccion, 'perder la direccion deja al cliente sin reparto').toBe('Calle Mayor 1');
  });

  it('un alta sin email NO borra el que ya había', () => {
    const fusion = fusionarCliente({ telefono: '600111222' }, existente);

    expect(fusion.email).toBe('ana@ejemplo.com');
  });

  it('unos datos vacíos dejan la ficha exactamente igual', () => {
    const fusion = fusionarCliente({}, existente);

    expect(fusion).toEqual({
      nombre: 'Ana Pérez',
      email: 'ana@ejemplo.com',
      telefono: '600111222',
      direccion: 'Calle Mayor 1',
    });
  });
});

describe('lo que viene manda', () => {
  it('actualiza el nombre cuando llega uno nuevo', () => {
    expect(fusionarCliente({ nombre: 'Ana Gómez' }, existente).nombre).toBe('Ana Gómez');
  });

  it('actualiza varios campos a la vez', () => {
    const fusion = fusionarCliente({ nombre: 'Ana G.', direccion: 'Plaza Nueva 3' }, existente);

    expect(fusion).toMatchObject({ nombre: 'Ana G.', direccion: 'Plaza Nueva 3' });
    expect(fusion.telefono).toBe('600111222');
  });
});

describe('distinción entre ausente y vacío', () => {
  it('una cadena vacía SÍ sobrescribe: el usuario la borró a propósito', () => {
    // `??` solo cae al valor previo con null/undefined. Una cadena vacía es una
    // decisión explícita del usuario en el formulario, no un dato que falta.
    expect(fusionarCliente({ direccion: '' }, existente).direccion).toBe('');
  });

  it('un null explícito conserva el valor previo', () => {
    expect(fusionarCliente({ direccion: null }, existente).direccion).toBe('Calle Mayor 1');
  });
});

describe('ficha previa incompleta', () => {
  it('rellena lo que faltaba en la ficha guardada', () => {
    const incompleto = { ...existente, direccion: null, email: null } as Cliente;
    const fusion = fusionarCliente({ direccion: 'Calle Nueva 5' }, incompleto);

    expect(fusion.direccion).toBe('Calle Nueva 5');
    expect(fusion.email).toBeNull();
  });
});
