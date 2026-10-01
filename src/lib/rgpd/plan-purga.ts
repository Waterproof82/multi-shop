import { retencionClientesAnios } from '@/lib/empresa/tpv-legal';

/**
 * Qué se borra al anonimizar un cliente. `direccion` faltaba hasta el
 * 2026-10-01: los clientes "anonimizados" conservaban su dirección de entrega.
 */
export const CAMPOS_ANONIMIZADOS = {
  nombre: 'ANONIMIZADO',
  email: null,
  telefono: null,
  direccion: null,
} as const;

/**
 * Copia de la dirección (y la ubicación exacta) que guarda cada pedido a
 * domicilio. Sin borrarla, anonimizar al cliente no anonimiza su domicilio.
 * Ningún trigger AFTER UPDATE de `pedidos` vigila estas columnas (solo
 * `estado`, `detalle_pedido`, `total`): el borrado no dispara Realtime ni push.
 */
export const CAMPOS_PEDIDO_ANONIMIZADOS = {
  direccion_entrega: null,
  codigo_postal: null,
  latitude_entrega: null,
  longitude_entrega: null,
} as const;

export interface EmpresaPurga {
  readonly id: string;
  readonly tpvHabilitado: boolean;
}

export interface GrupoPurga {
  readonly anios: number;
  readonly empresaIds: string[];
  /** ISO: se anonimiza a quien tenga `ultima_actividad` anterior a esta fecha. */
  readonly corte: string;
}

function restarAnios(fecha: Date, anios: number): string {
  const d = new Date(fecha);
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  return d.toISOString();
}

/** Un grupo por plazo de retención; los grupos vacíos no se devuelven. */
export function planDePurga(empresas: readonly EmpresaPurga[], ahora: Date): GrupoPurga[] {
  const porPlazo = new Map<number, string[]>();
  for (const e of empresas) {
    const anios = retencionClientesAnios(e.tpvHabilitado);
    porPlazo.set(anios, [...(porPlazo.get(anios) ?? []), e.id]);
  }
  return [...porPlazo.entries()]
    .sort(([a], [b]) => b - a)
    .map(([anios, empresaIds]) => ({ anios, empresaIds, corte: restarAnios(ahora, anios) }));
}
