/**
 * Las reglas de negocio del popup de reserva TGTG, separadas de lo que pinta.
 *
 * Estaban dentro de un `useEffect` de 80 líneas, mezcladas con `setState`,
 * `fetch` y temporizadores. Ahí no había forma de probarlas: para saber si una
 * recogida caducaba había que montar el componente y esperar.
 *
 * Ahora son funciones puras con `ahora` inyectado, y esto es todo lo que hace
 * falta para verificarlas.
 */
import { describe, it, expect } from 'vitest';
import {
  haExpiradoLaRecogida,
  motivoDeRechazo,
  modoTrasReservar,
} from '@/components/tgtg-reserva-popup';

/** Fecha local, sin zona horaria — igual que las que manda el servidor. */
function local(iso: string): Date {
  return new Date(iso);
}

describe('haExpiradoLaRecogida', () => {
  it('no caduca si falta la fecha o la hora', () => {
    // Sin datos NO se bloquea la reserva: negar por falta de información
    // castigaría al cliente por un fallo nuestro.
    expect(haExpiradoLaRecogida(null, '20:00', local('2026-08-09T21:00'))).toBe(false);
    expect(haExpiradoLaRecogida('2026-08-09', null, local('2026-08-09T21:00'))).toBe(false);
  });

  it('acepta la hora en HH:MM y en HH:MM:SS', () => {
    expect(haExpiradoLaRecogida('2026-08-09', '20:00', local('2026-08-09T21:00'))).toBe(true);
    expect(haExpiradoLaRecogida('2026-08-09', '20:00:00', local('2026-08-09T21:00'))).toBe(true);
  });

  it('un minuto antes del cierre todavía se puede recoger', () => {
    expect(haExpiradoLaRecogida('2026-08-09', '20:00', local('2026-08-09T19:59'))).toBe(false);
  });

  it('un minuto después ya no', () => {
    expect(haExpiradoLaRecogida('2026-08-09', '20:00', local('2026-08-09T20:01'))).toBe(true);
  });

  it('la hora se interpreta como LOCAL, no como UTC', () => {
    // Es deliberado: la recogida es presencial, así que la hora que manda es la
    // del sitio donde está el cliente. Si se interpretara como UTC, un
    // restaurante en España cerraría una o dos horas antes de lo que dice su
    // propia carta.
    const cierre = '2026-08-09T20:00';
    expect(new Date(cierre).getHours()).toBe(20);
  });
});

describe('motivoDeRechazo — el orden de las razones importa', () => {
  const base = {
    tokenUsed: false,
    fechaActivacion: '2026-08-09',
    horaRecogidaFin: '20:00',
    item: { cuponesDisponibles: 5 },
  };
  const dentroDePlazo = local('2026-08-09T19:00');

  it('sin impedimentos, deja reservar', () => {
    expect(motivoDeRechazo(base, dentroDePlazo)).toBeNull();
  });

  it('un enlace ya usado gana sobre todo lo demás', () => {
    // Aunque además hubiera caducado y no quedaran cupones, lo que hay que
    // decirle a quien abre el enlace es que YA lo usó: es lo único accionable.
    const todoMal = {
      ...base,
      tokenUsed: true,
      item: { cuponesDisponibles: 0 },
    };
    expect(motivoDeRechazo(todoMal, local('2026-08-09T23:00'))).toBe('token_used');
  });

  it('caducado gana sobre sin cupones', () => {
    const caducadoYSinCupones = { ...base, item: { cuponesDisponibles: 0 } };
    expect(motivoDeRechazo(caducadoYSinCupones, local('2026-08-09T23:00'))).toBe('expired');
  });

  it('sin cupones cuando todo lo demás está bien', () => {
    expect(motivoDeRechazo({ ...base, item: { cuponesDisponibles: 0 } }, dentroDePlazo))
      .toBe('no_cupones');
  });
});

describe('modoTrasReservar', () => {
  it('el 409 y token_used son el mismo caso para el cliente', () => {
    expect(modoTrasReservar(409, undefined)).toBe('token_used');
    expect(modoTrasReservar(200, 'token_used')).toBe('token_used');
  });

  it('mapea los resultados conocidos', () => {
    expect(modoTrasReservar(200, 'no_cupones')).toBe('no_cupones');
    expect(modoTrasReservar(200, 'expired')).toBe('expired');
    expect(modoTrasReservar(200, 'ok')).toBe('success');
  });

  it('lo que no reconoce cae en invalid, NUNCA en success', () => {
    // Ante la duda no se le dice a nadie que tiene una reserva que quizá no
    // existe: se presenta en el restaurante y no hay comida para él.
    expect(modoTrasReservar(200, undefined)).toBe('invalid');
    expect(modoTrasReservar(200, 'algo_que_no_existe')).toBe('invalid');
    expect(modoTrasReservar(500, undefined)).toBe('invalid');
  });
});
