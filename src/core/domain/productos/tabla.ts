import { ProductoTabla, TablaCelda, TablaFila } from "../entities/types";

/**
 * Shape histórico de una fila de `productos.tabla_info`: un array plano de
 * celdas, sin imagen (el campo de imagen por fila se añadió después).
 */
type FilaLegacy = TablaCelda[];

type FilaDesconocida = FilaLegacy | { celdas?: unknown; imagen?: unknown } | unknown;

function esFilaLegacy(fila: unknown): fila is FilaLegacy {
  return Array.isArray(fila);
}

/**
 * Fila desde API/DB → dominio. Tolera las dos representaciones que existen
 * en la BASE de datos: el shape nuevo `{ celdas, imagen }` y el legacy
 * (array plano de celdas). El code deploya antes de que la migración
 * reacomode los datos, así que leer tabla_info SIN normalizar rompería
 * todo lo que hace `fila.celdas` con un `undefined`.
 */
export function filaDesdeApi(fila: FilaDesconocida): TablaFila {
  if (esFilaLegacy(fila)) {
    return { celdas: fila, imagen: null };
  }
  const objeto = fila as { celdas?: unknown; imagen?: unknown };
  return {
    celdas: (Array.isArray(objeto.celdas) ? objeto.celdas : []) as TablaCelda[],
    imagen: typeof objeto.imagen === 'string' && objeto.imagen.length > 0 ? objeto.imagen : null,
  };
}

/**
 * `productos.tabla_info` (JSONB crudo o ya tipado) → dominio normalizado.
 * Punto único de normalización del shape de la tabla: repositorios y el
 * formulario admin usan ESTA función, nunca un cast directo.
 */
export function tablaDesdeApi(tabla: unknown): ProductoTabla | null {
  if (!tabla || typeof tabla !== 'object') return null;
  const datos = tabla as { columnas?: unknown; filas?: unknown };
  const columnas = Array.isArray(datos.columnas) ? (datos.columnas as TablaCelda[]) : [];
  const filas = Array.isArray(datos.filas) ? (datos.filas as unknown[]).map(filaDesdeApi) : [];
  if (columnas.length === 0) return null;
  return { columnas, filas };
}
