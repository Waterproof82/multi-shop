/**
 * Que pantalla ve el comensal en la mesa.
 *
 * `MesaOrdersClient` no es una pantalla: son cinco, y decide entre ellas antes
 * de pintar nada. Esa decision vivia como cuatro `if (...) return <Vista/>`
 * seguidos, con la vista entera dentro de cada uno.
 *
 * Aqui cada fila nombra su pantalla. Devuelve la VISTA, no un booleano: en la
 * pantalla donde se paga, `'esperando-cobro-propio'` dice lo que `true` no dice.
 * Congelado en `tests/compliance/mesa-vista.test.ts`.
 *
 * A diferencia de las reglas del WaiterBanner, aqui **el orden no es contrato**:
 * las cuatro son mutuamente excluyentes y hay un test que lo comprueba. Se puede
 * reordenar sin miedo; lo que no se puede es anadir una quinta sin comprobar que
 * sigue siendo cierto.
 */

export type EstadoTurno = 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado';

export type TurnoPersonalizado = Readonly<{
  id: string;
  status: EstadoTurno;
}>;

/** Subconjunto de `MesaSessionData` del que depende la decision. */
export type SesionParaVista = Readonly<{
  divisionTipo?: 'igual' | 'personalizado' | null;
  sesionPagada: boolean;
  customTurno?: TurnoPersonalizado | null;
}>;

export type ContextoVistaMesa = Readonly<{
  /** `null` mientras el primer fetch de la sesion no ha vuelto. */
  sesion: SesionParaVista | null;
  /** Turno personalizado que este dispositivo reclamo, si reclamo alguno. */
  activeTurnoId: string | null;
  /** La sesion pertenece a un camarero actuando en nombre de la mesa. */
  esModoCamarero: boolean;
  /** El comensal cerro el panel de items restantes en esta visita. */
  ocultandoAccionesRestantes: boolean;
}>;

export type VistaMesa =
  | 'seleccion-personalizada'
  | 'esperando-cobro-propio'
  | 'esperando-turno-ajeno'
  | 'acciones-restantes'
  | 'ticket';

/** El turno que hay abierto en la mesa es el que reclamo este dispositivo. */
function turnoEsPropio(ctx: ContextoVistaMesa): boolean {
  const turno = ctx.sesion?.customTurno;
  return !!ctx.activeTurnoId && turno?.id === ctx.activeTurnoId;
}

/** Hay un turno abierto y no lo reclamo este dispositivo. */
function turnoEsAjeno(ctx: ContextoVistaMesa): boolean {
  const status = ctx.sesion?.customTurno?.status;
  return (status === 'en_seleccion' || status === 'en_pago') && !ctx.activeTurnoId;
}

type Regla = Readonly<{
  vista: VistaMesa;
  aplica: (ctx: ContextoVistaMesa) => boolean;
}>;

const REGLAS: readonly Regla[] = [
  // El camarero tambien la ve: es la pantalla desde la que registra un cobro a
  // mano. Las otras tres son solo del comensal.
  {
    vista: 'seleccion-personalizada',
    aplica: (c) => turnoEsPropio(c) && c.sesion?.customTurno?.status === 'en_seleccion',
  },

  // Esperando el webhook de Redsys. El comensal no puede hacer nada util aqui.
  {
    vista: 'esperando-cobro-propio',
    aplica: (c) => !c.esModoCamarero && turnoEsPropio(c) && c.sesion?.customTurno?.status === 'en_pago',
  },

  // Otro comensal tiene el turno: la cuenta esta bloqueada mientras elige o paga.
  {
    vista: 'esperando-turno-ajeno',
    aplica: (c) => !c.esModoCamarero && turnoEsAjeno(c),
  },

  // Reparto personalizado entre turnos: quedan items por reclamar.
  {
    vista: 'acciones-restantes',
    aplica: (c) =>
      !c.esModoCamarero &&
      c.sesion?.divisionTipo === 'personalizado' &&
      !c.sesion.customTurno &&
      !c.sesion.sesionPagada &&
      !c.ocultandoAccionesRestantes,
  },
];

/** La cuenta completa es el caso por defecto, no una regla mas. */
export function vistaParaMesa(ctx: ContextoVistaMesa): VistaMesa {
  return REGLAS.find((regla) => regla.aplica(ctx))?.vista ?? 'ticket';
}
