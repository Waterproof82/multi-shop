/**
 * Payload de actualización de empresa.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `SupabaseEmpresaRepository.update` eran 26 `if (campo !== undefined)` seguidos,
 * con una nota a media función avisando de que los booleanos NO podían usar
 * `|| null`. Esa nota era todo lo que separaba al proyecto de un bug feo:
 *
 *   `mostrar_promociones: false || null` → `null` → la columna vuelve a su
 *   DEFAULT → **apagar el interruptor lo deja encendido**.
 *
 * Lo mismo con un descuento del 0%. Un aviso en un comentario no impide que el
 * siguiente campo booleano se añada en la lista equivocada; una prueba sí.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: vi.fn(), logFromCatch: vi.fn() },
}));

import { construirPayloadEmpresa } from '../../src/core/infrastructure/database/supabase-empresa.repository';

describe('campos ausentes', () => {
  it('un payload vacío no toca ninguna columna', () => {
    // `undefined` significa "no lo toques": una actualización parcial no puede
    // borrar lo que no venía en el formulario.
    expect(construirPayloadEmpresa({})).toEqual({});
  });

  it('solo incluye lo que se envió', () => {
    expect(construirPayloadEmpresa({ nif: 'B123' })).toEqual({ nif: 'B123' });
  });
});

describe('campos de texto: la cadena vacía se guarda como NULL', () => {
  it('convierte el texto vacío en null', () => {
    // Guardar '' dejaría `fb: ''` en vez de "sin Facebook", y el pie de la web
    // pública pintaría un enlace roto.
    expect(construirPayloadEmpresa({ fb: '' })).toEqual({ fb: null });
    expect(construirPayloadEmpresa({ direccion: '' })).toEqual({ direccion: null });
  });

  it('conserva el texto con contenido', () => {
    expect(construirPayloadEmpresa({ fb: 'https://fb.com/x' })).toEqual({ fb: 'https://fb.com/x' });
  });
});

describe('BOOLEANOS: false debe llegar como false, nunca como null', () => {
  const interruptores = [
    'mostrar_logo',
    'validacion_pedidos_habilitada',
    'mostrar_promociones',
    'mostrar_tgtg',
    'descuento_bienvenida_activo',
  ] as const;

  it.each(interruptores)('%s a false se guarda como false', (campo) => {
    const payload = construirPayloadEmpresa({ [campo]: false });

    expect(payload[campo], `${campo}: un null aqui haria que apagar el interruptor lo dejara encendido`).toBe(false);
  });

  it.each(interruptores)('%s a true se guarda como true', (campo) => {
    expect(construirPayloadEmpresa({ [campo]: true })[campo]).toBe(true);
  });
});

describe('NÚMEROS: el cero debe llegar como cero', () => {
  it('un descuento del 0% no se convierte en null', () => {
    expect(construirPayloadEmpresa({ descuento_bienvenida_porcentaje: 0 }).descuento_bienvenida_porcentaje).toBe(0);
  });

  it('una duración de 0 no se convierte en null', () => {
    expect(construirPayloadEmpresa({ descuento_bienvenida_duracion: 0 }).descuento_bienvenida_duracion).toBe(0);
  });

  it('un impuesto del 0% (exento) no se convierte en null', () => {
    // `porcentaje_impuesto: 0` es exención fiscal, no "sin configurar".
    expect(construirPayloadEmpresa({ porcentaje_impuesto: 0 }).porcentaje_impuesto).toBe(0);
  });
});

describe('combinaciones', () => {
  it('mezcla texto vacío y booleano false sin confundirlos', () => {
    const payload = construirPayloadEmpresa({ fb: '', mostrar_promociones: false });

    expect(payload).toEqual({ fb: null, mostrar_promociones: false });
  });
});
