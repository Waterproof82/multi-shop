/**
 * Plazos de conservación de los registros de cada empresa.
 *
 * El plazo cuenta por EJERCICIO completo: todo lo de 2026 se conserva hasta el
 * 31/12 de 2026 + N años. Es como se inspecciona (por ejercicios, no pedido a
 * pedido), y un borrado futuro sería de años enteros: borrar medio ejercicio
 * dejaría su contabilidad incompleta.
 *
 * Que un ejercicio esté vencido NO lo borra: lo decide la empresa (nosotros
 * somos encargados del tratamiento, art. 28 RGPD), y el plazo se alarga si hay
 * una inspección o reclamación abierta sobre ese ejercicio.
 *
 * Los clientes no están aquí: sus datos personales se anonimizan solos (cron
 * mensual, `retencionClientesAnios` en `tpv-legal.ts`).
 */

export type ClaveApartado = 'pedidos' | 'cobros' | 'turnos' | 'fichajes';

export interface ApartadoRetencion {
  readonly clave: ClaveApartado;
  readonly plazoAnios: number;
  readonly base: string;
}

export const APARTADOS_RETENCION: readonly ApartadoRetencion[] = [
  { clave: 'pedidos', plazoAnios: 6, base: 'Art. 30 Código de Comercio' },
  { clave: 'cobros', plazoAnios: 5, base: 'Art. 66 LGT' },
  { clave: 'turnos', plazoAnios: 5, base: 'Ley 11/2021' },
  { clave: 'fichajes', plazoAnios: 4, base: 'Art. 34.9 Estatuto de los Trabajadores' },
];

export interface TiempoRestante {
  readonly anios: number;
  readonly meses: number;
  readonly dias: number;
}

/**
 * Último instante en que el ejercicio debe conservarse: 31/12 de (ejercicio +
 * plazo) a las 23:59:59.999 en Madrid = 22:59:59.999 UTC (diciembre es CET).
 * Con 23:59 UTC, en Madrid ya sería 1 de enero y se mostraría el año siguiente.
 */
export function conservarHasta(ejercicio: number, plazoAnios: number): Date {
  return new Date(Date.UTC(ejercicio + plazoAnios, 11, 31, 22, 59, 59, 999));
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

/** Años, meses y días de `hoy` a `hasta` (en UTC). `null` si ya pasó. */
export function tiempoRestante(hoy: Date, hasta: Date): TiempoRestante | null {
  if (hasta.getTime() < hoy.getTime()) return null;
  let anios = hasta.getUTCFullYear() - hoy.getUTCFullYear();
  let meses = hasta.getUTCMonth() - hoy.getUTCMonth();
  let dias = hasta.getUTCDate() - hoy.getUTCDate();
  if (dias < 0) {
    meses -= 1;
    const mesAnterior = (hasta.getUTCMonth() + 11) % 12;
    const anioMesAnterior = hasta.getUTCMonth() === 0 ? hasta.getUTCFullYear() - 1 : hasta.getUTCFullYear();
    dias += diasDelMes(anioMesAnterior, mesAnterior);
  }
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  return { anios, meses, dias };
}

export interface EstadoEjercicio {
  readonly ejercicio: number;
  readonly registros: number;
  readonly conservarHasta: Date;
  readonly vencido: boolean;
  readonly restante: TiempoRestante | null;
}

export function estadoEjercicio(
  { ejercicio, plazoAnios, registros }: Readonly<{ ejercicio: number; plazoAnios: number; registros: number }>,
  hoy: Date,
): EstadoEjercicio {
  const hasta = conservarHasta(ejercicio, plazoAnios);
  const restante = tiempoRestante(hoy, hasta);
  return { ejercicio, registros, conservarHasta: hasta, vencido: restante === null, restante };
}

/** Fila tal como la devuelve `retencion_resumen()` en BD. */
export interface FilaRetencion {
  readonly apartado: string;
  readonly ejercicio: number;
  readonly registros: number;
}

export interface ResumenApartado extends ApartadoRetencion {
  readonly ejercicios: readonly EstadoEjercicio[];
}

/** Agrupa por apartado (en el orden de `APARTADOS_RETENCION`) y omite los que no tienen datos. */
export function resumenRetencion(filas: readonly FilaRetencion[], hoy: Date): ResumenApartado[] {
  return APARTADOS_RETENCION.map((apartado) => ({
    ...apartado,
    ejercicios: filas
      .filter((f) => f.apartado === apartado.clave)
      .toSorted((a, b) => a.ejercicio - b.ejercicio)
      .map((f) => estadoEjercicio({ ejercicio: f.ejercicio, plazoAnios: apartado.plazoAnios, registros: f.registros }, hoy)),
  })).filter((a) => a.ejercicios.length > 0);
}

/** Palabras de la cuenta atrás; la UI las pasa traducidas. */
export interface UnidadesTiempo {
  readonly anio: string;
  readonly anios: string;
  readonly mes: string;
  readonly meses: string;
  readonly dia: string;
  readonly dias: string;
  readonly y: string;
  readonly hoy: string;
}

const UNIDADES_ES: UnidadesTiempo = {
  anio: 'año', anios: 'años', mes: 'mes', meses: 'meses', dia: 'día', dias: 'días', y: 'y', hoy: 'hoy',
};

/** "6 años, 2 meses y 30 días" — para la cuenta atrás. */
export function textoRestante({ anios, meses, dias }: TiempoRestante, u: UnidadesTiempo = UNIDADES_ES): string {
  const partes = [
    [anios, u.anio, u.anios],
    [meses, u.mes, u.meses],
    [dias, u.dia, u.dias],
  ] as const;
  const visibles = partes.filter(([n]) => n > 0).map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);
  if (visibles.length === 0) return u.hoy;
  if (visibles.length === 1) return visibles[0];
  return `${visibles.slice(0, -1).join(', ')} ${u.y} ${visibles.at(-1)}`;
}

/**
 * Descarga de un ejercicio completo. Cobros y fichajes reutilizan sus
 * exportadores (los mismos que usa el inspector). Los turnos aún no tienen.
 */
export function urlDescarga(clave: ClaveApartado, ejercicio: number): string | null {
  const desde = `${ejercicio}-01-01`;
  const hasta = `${ejercicio}-12-31`;
  switch (clave) {
    case 'pedidos': return `/api/admin/historial/pedidos?ejercicio=${ejercicio}`;
    case 'cobros': return `/api/tpv/audit/export?desde=${desde}&hasta=${hasta}`;
    case 'fichajes': return `/api/laborcontrol/export?tipo=excel&from=${desde}&to=${hasta}`;
    case 'turnos': return null;
  }
}
