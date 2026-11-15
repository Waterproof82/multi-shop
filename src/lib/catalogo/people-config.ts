import "server-only";
import { getSupabaseClient } from "@/core/infrastructure/database/supabase-client";
import { parseRegla } from "@/lib/catalogo/escala-people";
import type { PeopleRegla } from "@/core/domain/entities/types";

export interface PeopleConfigDatos {
  min: number;
  max: number;
  pasoCents: number;
  /** Regla por fila de `tabla_info.filas` (índice alineado); null = fila sin regla (cantidad base). */
  filas: (PeopleRegla | null)[];
}

/**
 * Configurador de personas de UN producto de tienda (kits): límites del
 * contador y paso de precio viven en `productos` (columnas sin GRANT a
 * anon) y la regla de cada fila en `receta_items` (RLS deny-all a anon).
 * Ambas lecturas van por service_role — este módulo es server-only y el
 * PDP solo lo llama para EL producto resuelto en la petición (cargar-
 * producto.ts), nunca desde el menú cacheado de todo el tenant.
 *
 * Devuelve null cuando el producto no tiene configurador (columnas
 * personas_* a NULL): la feature es invisible, igual que antes de la
 * migración.
 */
export async function cargarPeopleConfig(
  empresaId: string,
  productoId: string,
  filasTabla: number,
): Promise<PeopleConfigDatos | null> {
  const supabase = getSupabaseClient();

  const { data: producto, error: productoError } = await supabase
    .from('productos')
    .select('personas_min, personas_max, personas_paso_cents')
    .eq('id', productoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (productoError) throw new Error(productoError.message);
  if (!producto) return null;

  const { personas_min: min, personas_max: max, personas_paso_cents: pasoCents } = producto as {
    personas_min: number | null;
    personas_max: number | null;
    personas_paso_cents: number | null;
  };
  // CHECK productos_personas_config_check: aparecen o desaparecen juntos.
  // Defensive igual: cualquiera NULL = sin configurador.
  if (min == null || max == null || pasoCents == null) return null;

  const { data: recetas, error: recetasError } = await supabase
    .from('receta_items')
    .select('regla_personas, tabla_fila')
    .eq('producto_id', productoId);
  if (recetasError) throw new Error(recetasError.message);

  const filas: (PeopleRegla | null)[] = Array.from({ length: filasTabla }, () => null);
  for (const receta of (recetas ?? []) as { regla_personas: string | null; tabla_fila: number | null }[]) {
    const regla = parseRegla(receta.regla_personas);
    const fila = receta.tabla_fila;
    // Filas sin regla, sin enlace a tabla o fuera de rango quedan null
    // (cantidad base). No se inventa escalado: la cobertura 100% la vigila
    // el test de compliance sobre la DB viva.
    if (regla === null || fila === null || fila < 0 || fila >= filasTabla) continue;
    filas[fila] = regla;
  }

  return { min, max, pasoCents, filas };
}
