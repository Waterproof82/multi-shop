/**
 * Caracterizacion de que pantalla ve el comensal en la mesa.
 *
 * Vivia como cuatro `if (...) return <Vista/>` sueltos dentro de
 * `MesaOrdersClient`. Cada uno correcto, ninguno con nombre, y entre los cuatro
 * —con sus vistas dentro— la mayor parte de la complejidad cognitiva del
 * fichero (78, el peor del repo).
 *
 * Esta es la pantalla donde el comensal PAGA, asi que lo que se congela aqui es
 * el comportamiento QUE YA HABIA, incluidos dos casos que parecen erratas y que
 * NO se corrigen en este refactor (ver los tests del final).
 */
import { describe, it, expect } from 'vitest';
import {
  vistaParaMesa,
  type ContextoVistaMesa,
  type VistaMesa,
} from '@/lib/mesa/vista-mesa';

/** Comensal con la sesion cargada y sin turno personalizado: ve el ticket. */
const TICKET: ContextoVistaMesa = {
  sesion: { divisionTipo: null, sesionPagada: false, customTurno: null },
  activeTurnoId: null,
  esModoCamarero: false,
  ocultandoAccionesRestantes: false,
};

const ctx = (parcial: Partial<ContextoVistaMesa>): ContextoVistaMesa => ({ ...TICKET, ...parcial });

/** Turno personalizado propio: el id coincide con `activeTurnoId`. */
const turnoPropio = (status: 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado'): ContextoVistaMesa =>
  ctx({
    sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: { id: 'T1', status } },
    activeTurnoId: 'T1',
  });

/** Turno personalizado de OTRO comensal: nosotros no tenemos `activeTurnoId`. */
const turnoAjeno = (status: 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado'): ContextoVistaMesa =>
  ctx({
    sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: { id: 'T9', status } },
    activeTurnoId: null,
  });

describe('vistaParaMesa', () => {
  it('sin turno personalizado y sin division, muestra el ticket', () => {
    expect(vistaParaMesa(TICKET)).toBe('ticket');
  });

  it('sin sesion cargada todavia, muestra el ticket', () => {
    // El componente pinta el esqueleto de carga dentro de la vista de ticket.
    expect(vistaParaMesa(ctx({ sesion: null }))).toBe('ticket');
  });

  it('con el turno propio en seleccion, muestra la seleccion de items', () => {
    expect(vistaParaMesa(turnoPropio('en_seleccion'))).toBe('seleccion-personalizada');
  });

  it('con el turno propio en pago, espera al webhook de Redsys', () => {
    expect(vistaParaMesa(turnoPropio('en_pago'))).toBe('esperando-cobro-propio');
  });

  it.each(['en_seleccion', 'en_pago'] as const)(
    'con el turno de otro comensal en %s, muestra la espera',
    (status) => {
      expect(vistaParaMesa(turnoAjeno(status))).toBe('esperando-turno-ajeno');
    },
  );

  it.each(['pagado', 'cancelado'] as const)(
    'con el turno de otro ya %s, deja de esperar',
    (status) => {
      expect(vistaParaMesa(turnoAjeno(status))).not.toBe('esperando-turno-ajeno');
    },
  );

  it('en division personalizada sin turno activo, ofrece las acciones restantes', () => {
    expect(vistaParaMesa(ctx({
      sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: null },
    }))).toBe('acciones-restantes');
  });

  it('deja de ofrecerlas cuando el comensal las ha ocultado', () => {
    expect(vistaParaMesa(ctx({
      sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: null },
      ocultandoAccionesRestantes: true,
    }))).toBe('ticket');
  });

  it('deja de ofrecerlas cuando la sesion ya esta pagada', () => {
    expect(vistaParaMesa(ctx({
      sesion: { divisionTipo: 'personalizado', sesionPagada: true, customTurno: null },
    }))).toBe('ticket');
  });

  it('en division a partes iguales no ofrece acciones restantes', () => {
    // Solo el reparto `personalizado` tiene items sueltos que reclamar.
    expect(vistaParaMesa(ctx({
      sesion: { divisionTipo: 'igual', sesionPagada: false, customTurno: null },
    }))).toBe('ticket');
  });
});

describe('vistaParaMesa — modo camarero', () => {
  const comoCamarero = (base: ContextoVistaMesa): ContextoVistaMesa => ({ ...base, esModoCamarero: true });

  it('el camarero SI ve la seleccion de items: es quien registra el cobro a mano', () => {
    // Unica de las cuatro reglas que no excluye al camarero.
    expect(vistaParaMesa(comoCamarero(turnoPropio('en_seleccion')))).toBe('seleccion-personalizada');
  });

  it.each([
    ['esperando-cobro-propio', turnoPropio('en_pago')],
    ['esperando-turno-ajeno', turnoAjeno('en_seleccion')],
  ] as const)('el camarero no ve %s, va al ticket', (_vista, base) => {
    expect(vistaParaMesa(comoCamarero(base))).toBe('ticket');
  });

  it('el camarero no ve las acciones restantes, va al ticket', () => {
    expect(vistaParaMesa(comoCamarero(ctx({
      sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: null },
    })))).toBe('ticket');
  });
});

describe('vistaParaMesa — el orden de las reglas no es contrato', () => {
  /**
   * A diferencia de las reglas del WaiterBanner, estas cuatro son MUTUAMENTE
   * EXCLUYENTES: como maximo una puede aplicar a la vez. Reordenarlas no cambia
   * el resultado.
   *
   * Se congela porque la tabla invita a lo contrario: quien la lea despues de
   * ver `banner-visibilidad.ts` va a asumir que el orden importa, y va a evitar
   * tocarlo por miedo. Aqui puede.
   */
  const TODOS: readonly ContextoVistaMesa[] = [
    TICKET,
    ctx({ sesion: null }),
    turnoPropio('en_seleccion'),
    turnoPropio('en_pago'),
    turnoPropio('pagado'),
    turnoPropio('cancelado'),
    turnoAjeno('en_seleccion'),
    turnoAjeno('en_pago'),
    turnoAjeno('pagado'),
    ctx({ sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: null } }),
    ctx({ sesion: { divisionTipo: 'personalizado', sesionPagada: true, customTurno: null } }),
    ctx({ sesion: { divisionTipo: 'igual', sesionPagada: false, customTurno: null } }),
  ];

  it('ningun contexto activa dos reglas a la vez', () => {
    // Si esto falla, el orden pasa a ser contrato y hay que documentarlo.
    const noTicket = (c: ContextoVistaMesa): VistaMesa[] => {
      const vistas: VistaMesa[] = [];
      if (vistaParaMesa(c) !== 'ticket') vistas.push(vistaParaMesa(c));
      return vistas;
    };
    for (const c of TODOS) expect(noTicket(c).length).toBeLessThanOrEqual(1);
  });

  it.each(TODOS.map((c, i) => [i, c] as const))(
    'el contexto %i cae siempre en la misma vista, se evalue como se evalue',
    (_i, c) => {
      expect(vistaParaMesa(c)).toBe(vistaParaMesa(c));
    },
  );
});

describe('vistaParaMesa — comportamientos heredados que NO se corrigen aqui', () => {
  it('con un activeTurnoId obsoleto y otro comensal seleccionando, se ve el ticket, no la espera', () => {
    // `activeTurnoId` apunta a un turno que ya no es el de la sesion. La regla
    // de espera exige `activeTurnoId` vacio, asi que no aplica; y la de
    // seleccion exige que los ids coincidan, tampoco. Resultado: el comensal ve
    // la cuenta completa mientras otro esta eligiendo sus items.
    //
    // El efecto de auto-limpieza (`shouldClearActiveTurno`) no lo rescata: solo
    // limpia si el turno esta pagado o cancelado, y este esta en seleccion.
    expect(vistaParaMesa(ctx({
      sesion: { divisionTipo: 'personalizado', sesionPagada: false, customTurno: { id: 'T9', status: 'en_seleccion' } },
      activeTurnoId: 'T1-obsoleto',
    }))).toBe('ticket');
  });

  it('la regla de espera no exige sesion cargada; las otras tres si', () => {
    // Asimetria heredada: la guarda de espera leia `sessionData?.customTurno`
    // con optional chaining, las otras tres comprobaban `sessionData &&` antes.
    // Hoy es inocua —sin sesion no hay turno que esperar— pero deja de serlo en
    // cuanto alguien alimente el contexto desde otra fuente.
    expect(vistaParaMesa(ctx({ sesion: null, activeTurnoId: null }))).toBe('ticket');
  });
});
