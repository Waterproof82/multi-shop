// Qué avisos de caducidad tocan hoy (sdd kit-expiry-reminders R4). Lógica
// pura: el cron lee de BD, llama aquí, envía y guarda `marcar` en
// `kit_avisos_enviados` (clave única = no se repite nunca).

import { diasHasta, type Caducidad } from './estado';

export const UMBRALES_AVISO_DIAS = [30, 15] as const;
export type UmbralAviso = (typeof UMBRALES_AVISO_DIAS)[number];

export type KitParaAvisos = {
  serie: string;
  kitSlug: string;
  avisosEmail: boolean;
  caducidades: readonly Caducidad[];
};

export type ElementoAviso = Caducidad & { umbralDias: UmbralAviso };

export type AvisoDebido = {
  serie: string;
  kitSlug: string;
  elementos: ElementoAviso[];
  /** Claves a guardar como enviadas tras un envío correcto. */
  marcar: string[];
};

// Clave = PK de kit_avisos_enviados. Usa el id del ingrediente, no su nombre:
// renombrarlo no debe volver a disparar un aviso ya enviado.
export function claveAviso(serie: string, ingredienteId: string, parte: string, umbral: UmbralAviso): string {
  return [serie, ingredienteId, parte, umbral, 'email'].join('|');
}

// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3b/DD2.
// `FilaEnviado` y `EnviadoAviso` son los tipos del cron; M3d1 los reexporta
// desde aquí para el contrato del repositorio — `avisos.ts` sigue siendo la
// única fuente de verdad sobre la clave.
export type FilaEnviado = { serie: string; ingredienteId: string; parte: string; umbralDias: UmbralAviso };
export type EnviadoAviso = FilaEnviado & { enviadoAt: string };

function esUmbralAviso(valor: string): boolean {
  return (UMBRALES_AVISO_DIAS as readonly number[]).includes(Number(valor)) && String(Number(valor)) === valor;
}

/**
 * Deshace `claveAviso`. La `parte` puede contener `|` (ej. partes del
 * botiquín con el separador del DIN 13164 en su nombre), así que solo el
 * 1.º trozo (serie), el 2.º (ingredienteId), el penúltimo (umbral) y el
 * último (canal) tienen posición fija; `parte` es todo lo del medio,
 * reunido con `|`. `null` si la clave no tiene al menos 5 trozos, el canal
 * no es `email` o el umbral no es 30/15.
 */
export function parsearClaveAviso(clave: string): FilaEnviado | null {
  const trozos = clave.split('|');
  if (trozos.length < 5) return null;

  const [serie, ingredienteId] = trozos;
  const canal = trozos[trozos.length - 1];
  const umbralTexto = trozos[trozos.length - 2];
  const parte = trozos.slice(2, trozos.length - 2).join('|');

  if (canal !== 'email' || !esUmbralAviso(umbralTexto)) return null;

  return { serie, ingredienteId, parte, umbralDias: Number(umbralTexto) as UmbralAviso };
}

/**
 * M3b/DD3 (R-M3.2.4): un aviso enviado a un titular ANTERIOR no cuenta como
 * ya enviado — solo entran las filas con `enviadoAt >= registradoAt` de su
 * serie. Una serie sin `registradoAt` (no en el mapa) no entra: no hay
 * titular actual con el que comparar.
 */
export function clavesVigentes(
  filas: readonly EnviadoAviso[],
  registradoAt: ReadonlyMap<string, string>,
): Set<string> {
  const vigentes = new Set<string>();
  for (const fila of filas) {
    const registro = registradoAt.get(fila.serie);
    if (registro === undefined) continue;
    if (fila.enviadoAt < registro) continue;
    vigentes.add(claveAviso(fila.serie, fila.ingredienteId, fila.parte, fila.umbralDias));
  }
  return vigentes;
}

// El umbral más cercano que ya se ha alcanzado, o null si aún falta.
function umbralAlcanzado(diasRestantes: number): UmbralAviso | null {
  if (diasRestantes < 0) return null; // ya caducado: no se avisa
  const alcanzados = UMBRALES_AVISO_DIAS.filter((u) => diasRestantes <= u);
  return alcanzados.length === 0 ? null : alcanzados[alcanzados.length - 1];
}

function avisoDelElemento(
  hoy: string,
  serie: string,
  c: Caducidad,
  enviados: ReadonlySet<string>,
): { elemento: ElementoAviso; marcar: string[] } | null {
  const umbral = umbralAlcanzado(diasHasta(hoy, c.caducaEl));
  if (umbral === null) return null;
  if (enviados.has(claveAviso(serie, c.ingredienteId, c.parte, umbral))) return null;
  // Si ya toca el de 15, el de 30 (si no salió) se da por cubierto: un solo email.
  const marcar = UMBRALES_AVISO_DIAS.filter((u) => u >= umbral)
    .map((u) => claveAviso(serie, c.ingredienteId, c.parte, u))
    .filter((clave) => !enviados.has(clave));
  return { elemento: { ...c, umbralDias: umbral }, marcar };
}

export function avisosDebidos(
  hoy: string,
  kits: readonly KitParaAvisos[],
  enviados: ReadonlySet<string>,
): AvisoDebido[] {
  const avisos: AvisoDebido[] = [];
  for (const kit of kits) {
    if (!kit.avisosEmail) continue;
    const debidos = kit.caducidades
      .map((c) => avisoDelElemento(hoy, kit.serie, c, enviados))
      .filter((a): a is NonNullable<typeof a> => a !== null);
    if (debidos.length === 0) continue;
    avisos.push({
      serie: kit.serie,
      kitSlug: kit.kitSlug,
      elementos: debidos.map((d) => d.elemento),
      marcar: debidos.flatMap((d) => d.marcar),
    });
  }
  return avisos;
}
