// Estado de un kit a partir de las fechas reales de su lote (sdd
// kit-expiry-reminders R3.0). Lo pinta la página del QR de la etiqueta.
// Fechas como 'YYYY-MM-DD' (hoy en Europe/Madrid, lo calcula quien llama):
// así el cálculo no depende de la zona horaria del servidor.

export const UMBRAL_CADUCA_PRONTO_DIAS = 30;

export type EstadoElemento = 'al_dia' | 'caduca_pronto' | 'caducado';
export type EstadoGeneral = EstadoElemento | 'sin_datos';

export type Caducidad = {
  ingredienteId: string; // FK a ingredientes: la identidad del consumible
  consumible: string; // nombre para mostrar (ingredientes.nombre)
  parte: string; // '' = la fila entera; botiquín: una fila por parte (D5)
  caducaEl: string; // ISO date
};

export type ElementoConEstado = Caducidad & { diasRestantes: number; estado: EstadoElemento };

const MS_DIA = 86_400_000;

function aUtc(iso: string): number {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/** Días naturales de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasHasta(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);
}

// La fecha impresa es el último día válido: caduca al día siguiente.
function estadoDe(diasRestantes: number): EstadoElemento {
  if (diasRestantes < 0) return 'caducado';
  if (diasRestantes <= UMBRAL_CADUCA_PRONTO_DIAS) return 'caduca_pronto';
  return 'al_dia';
}

const GRAVEDAD: Record<EstadoElemento, number> = { al_dia: 0, caduca_pronto: 1, caducado: 2 };

function peorEstado(elementos: readonly ElementoConEstado[]): EstadoGeneral {
  if (elementos.length === 0) return 'sin_datos';
  return elementos.reduce<EstadoElemento>(
    (peor, e) => (GRAVEDAD[e.estado] > GRAVEDAD[peor] ? e.estado : peor),
    'al_dia',
  );
}

export function estadoDelKit(
  hoy: string,
  caducidades: readonly Caducidad[],
): { general: EstadoGeneral; elementos: ElementoConEstado[] } {
  const elementos = caducidades
    .map((c) => {
      const diasRestantes = diasHasta(hoy, c.caducaEl);
      return { ...c, diasRestantes, estado: estadoDe(diasRestantes) };
    })
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
  return { general: peorEstado(elementos), elementos };
}
