import type { PeopleRegla } from "@/core/domain/entities/types";

/**
 * Escalado por personas de los kits (configurador de la tienda). Espejo
 * EXACTO de `factor_regla()` en la DB (migración
 * 20261114000001_store_people_configurator.sql): SQL y browser no pueden
 * compartir código, así que el drift entre ambos lo vigila la suite de
 * compliance (`store-people-config-coverage`) y los casos límite están
 * testeados con los mismos ejemplos en ambos lados.
 *
 * Semántica (multiplicador RELATIVO sobre la cantidad base de la fila):
 *   `por_persona` → base × N          (una por persona; la ración base-2
 *                                      del Plus escala 2×N con esta regla)
 *   `pack:C`      → base × ceil(N/C)  (un envase cubre C personas)
 *   `compartido`  → base × 1          (uno para todo el grupo)
 *   null          → base × 1          (fila sin regla: cantidad base)
 */

/** Parsea una regla tal como llega de la DB (`regla_personas`); inválida → null. */
export function parseRegla(valor: unknown): PeopleRegla | null {
  if (typeof valor !== 'string') return null;
  if (valor === 'por_persona' || valor === 'compartido') return valor;
  const m = /^pack:([0-9]+)$/.exec(valor);
  if (!m || Number.parseInt(m[1], 10) < 1) return null;
  return valor as PeopleRegla;
}

/** Factor de escalado de una regla para N personas (misma tabla que `factor_regla`). */
export function factorPeople(regla: PeopleRegla | null, personas: number): number {
  if (regla === null || !Number.isFinite(personas) || personas < 1) return 1;
  if (regla === 'por_persona') return personas;
  if (regla === 'compartido') return 1;
  const c = Number.parseInt(regla.slice('pack:'.length), 10);
  if (!Number.isFinite(c) || c < 1) return 1;
  return Math.ceil(personas / c);
}

/**
 * Precio unitario del kit a N personas: precio + paso × (N − min). Todo
 * sale de la DB (precio en €, paso en céntimos) — el precio que mande el
 * cliente nunca se usa para cobrar.
 */
export function precioUnitarioPeople(
  precioBase: number,
  pasoCents: number,
  personasMin: number,
  personas: number,
): number {
  return Math.round(precioBase * 100 + pasoCents * (personas - personasMin)) / 100;
}

/** Cantidad escalada de una fila (entero): base × factor. */
export function escalaCantidad(base: number, regla: PeopleRegla | null, personas: number): number {
  return Math.round(base * factorPeople(regla, personas));
}

/** Escala la CELDA "Cantidad" de la tabla (texto con un número al inicio:
 * "1", "2"...). Sin número → la celda se queda igual (fila compartida o
 * celda no numérica). Display-only: lo que cobra es el server.
 */
export function escalaCeldaCantidad(celda: string, regla: PeopleRegla | null, personas: number): string {
  const m = /^\s*(\d+(?:[.,]\d+)?)([\s\S]*)$/.exec(celda);
  if (!m) return celda;
  const base = Number.parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(base)) return celda;
  return `${escalaCantidad(base, regla, personas)}${m[2]}`;
}

/**
 * `?personas=N` de la URL del PDP (el server lo lee en el searchParams de la
 * página y lo pasa como prop). Tolerante: primer entero ≥ 1 del valor (o de
 * la primera entrada si viniera repetido); cualquier otra cosa → null y el
 * cliente arranca en el mínimo del configurador.
 */
export function parsePersonasParam(valor: string | string[] | undefined): number | null {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  if (typeof crudo !== 'string') return null;
  const n = Number.parseInt(crudo, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
