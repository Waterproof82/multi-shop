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

export function claveAviso(serie: string, consumible: string, parte: string, umbral: UmbralAviso): string {
  return [serie, consumible, parte, umbral, 'email'].join('|');
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
  if (enviados.has(claveAviso(serie, c.consumible, c.parte, umbral))) return null;
  // Si ya toca el de 15, el de 30 (si no salió) se da por cubierto: un solo email.
  const marcar = UMBRALES_AVISO_DIAS.filter((u) => u >= umbral)
    .map((u) => claveAviso(serie, c.consumible, c.parte, u))
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
