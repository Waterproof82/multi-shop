#!/usr/bin/env npx tsx

/**
 * Backfill de `productos.slug` para productos de tienda ya existentes
 * (product-detail-pages PR2c — tarea 2.7). PR1 solo genera el slug al crear
 * o editar un producto desde el admin; esto rellena los que ya existían
 * antes de ese cambio.
 *
 * Idempotente: solo toca filas con `slug IS NULL`, y solo de empresas
 * `tipo = 'tienda'` (los restaurantes no usan slug). Re-ejecutarlo tras un
 * primer backfill exitoso no encuentra nada que hacer.
 *
 * Import relativo (no `@/...`) porque tsx no resuelve los alias de
 * TypeScript fuera de Next — mismo motivo documentado en slug.ts.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/backfill-product-slugs.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-product-slugs.ts
 *
 *   --dry-run   imprime los (empresa, producto, slug) planificados y no
 *               escribe nada.
 *
 * En modo real, cada fila se actualiza una a una. Si Postgres devuelve 23505
 * (otra escritura ocupó ese slug entre la planificación y el UPDATE, p. ej.
 * un admin guardando el producto a la vez), esa fila se replanifica una
 * única vez contra el estado más reciente y se reintenta; si vuelve a
 * fallar, se cuenta como fallida y el script continúa con el resto.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { slugify, siguienteSlugLibre } from '../src/core/domain/productos/slug';

const PG_UNIQUE_VIOLATION = '23505';

export interface ProductoPendiente {
  readonly id: string;
  readonly empresaId: string;
  readonly titulo: string;
}

export interface SlugPlaneado {
  readonly empresaId: string;
  readonly productoId: string;
  readonly slug: string;
}

/**
 * Planificación pura: dados los productos pendientes (en el orden en que se
 * deban asignar) y los slugs ya ocupados por empresa, devuelve el slug a
 * escribir para cada uno. Las colisiones se resuelven por empresa y también
 * entre los propios pendientes de la misma tanda (un slug recién planificado
 * cuenta como ocupado para el siguiente producto de esa empresa). No muta
 * `ocupadosPorEmpresa`.
 */
export function planificarSlugs(
  pendientes: readonly ProductoPendiente[],
  ocupadosPorEmpresa: ReadonlyMap<string, ReadonlySet<string>>,
): SlugPlaneado[] {
  const ocupados = new Map<string, Set<string>>();
  const planificados: SlugPlaneado[] = [];

  for (const producto of pendientes) {
    const set = ocupados.get(producto.empresaId) ?? new Set(ocupadosPorEmpresa.get(producto.empresaId) ?? []);
    const slug = siguienteSlugLibre(slugify(producto.titulo), set);
    set.add(slug);
    ocupados.set(producto.empresaId, set);
    planificados.push({ empresaId: producto.empresaId, productoId: producto.id, slug });
  }

  return planificados;
}

// ─── I/O ────────────────────────────────────────────────────────────────────

async function obtenerEmpresasTienda(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from('empresas').select('id').eq('tipo', 'tienda');
  if (error) throw new Error(`No se pudieron leer las empresas de tipo tienda: ${error.message}`);
  return (data ?? []).map((row: { id: string }) => row.id);
}

async function obtenerPendientes(supabase: SupabaseClient, empresaIds: string[]): Promise<ProductoPendiente[]> {
  if (empresaIds.length === 0) return [];
  const { data, error } = await supabase
    .from('productos')
    .select('id, empresa_id, titulo_es')
    .in('empresa_id', empresaIds)
    .is('slug', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`No se pudieron leer los productos pendientes: ${error.message}`);
  return (data ?? []).map((row: { id: string; empresa_id: string; titulo_es: string }) => ({
    id: row.id,
    empresaId: row.empresa_id,
    titulo: row.titulo_es,
  }));
}

async function obtenerOcupadosPorEmpresa(
  supabase: SupabaseClient,
  empresaIds: string[],
): Promise<Map<string, Set<string>>> {
  const ocupados = new Map<string, Set<string>>();
  if (empresaIds.length === 0) return ocupados;
  const { data, error } = await supabase
    .from('productos')
    .select('empresa_id, slug')
    .in('empresa_id', empresaIds)
    .not('slug', 'is', null);
  if (error) throw new Error(`No se pudieron leer los slugs ya ocupados: ${error.message}`);
  for (const row of (data ?? []) as { empresa_id: string; slug: string }[]) {
    const set = ocupados.get(row.empresa_id) ?? new Set<string>();
    set.add(row.slug);
    ocupados.set(row.empresa_id, set);
  }
  return ocupados;
}

/** Replanifica una sola fila tras un 23505, contra los slugs ocupados más recientes de esa empresa. */
async function replanificarUna(
  supabase: SupabaseClient,
  pendiente: ProductoPendiente,
  slugQueColisiono: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('slug')
    .eq('empresa_id', pendiente.empresaId)
    .not('slug', 'is', null);
  if (error) {
    console.error(`  ! ${pendiente.id}: no se pudo releer los slugs para reintentar (${error.message})`);
    return null;
  }
  const ocupados = new Set<string>((data ?? []).map((row: { slug: string }) => row.slug));
  ocupados.add(slugQueColisiono);
  return siguienteSlugLibre(slugify(pendiente.titulo), ocupados);
}

interface ResumenAplicacion {
  ok: number;
  reintentado: number;
  fallido: number;
}

async function aplicarPlan(
  supabase: SupabaseClient,
  planes: readonly SlugPlaneado[],
  pendientesPorId: ReadonlyMap<string, ProductoPendiente>,
): Promise<ResumenAplicacion> {
  const resumen: ResumenAplicacion = { ok: 0, reintentado: 0, fallido: 0 };

  for (const plan of planes) {
    const { error } = await supabase.from('productos').update({ slug: plan.slug }).eq('id', plan.productoId);
    if (!error) {
      resumen.ok += 1;
      continue;
    }
    if (error.code !== PG_UNIQUE_VIOLATION) {
      console.error(`  ! ${plan.productoId}: ${error.message}`);
      resumen.fallido += 1;
      continue;
    }

    const pendiente = pendientesPorId.get(plan.productoId);
    const nuevoSlug = pendiente ? await replanificarUna(supabase, pendiente, plan.slug) : null;
    if (!nuevoSlug) {
      resumen.fallido += 1;
      continue;
    }

    const { error: segundoError } = await supabase.from('productos').update({ slug: nuevoSlug }).eq('id', plan.productoId);
    if (segundoError) {
      console.error(`  ! ${plan.productoId}: el reintento también falló (${segundoError.message})`);
      resumen.fallido += 1;
      continue;
    }
    console.warn(`  ~ ${plan.productoId}: colisión en "${plan.slug}", reasignado a "${nuevoSlug}"`);
    resumen.reintentado += 1;
  }

  return resumen;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const empresaIds = await obtenerEmpresasTienda(supabase);
  const pendientes = await obtenerPendientes(supabase, empresaIds);
  if (pendientes.length === 0) {
    console.log('Nada que hacer: no hay productos de tienda con slug pendiente.');
    return;
  }

  const ocupados = await obtenerOcupadosPorEmpresa(supabase, empresaIds);
  const planes = planificarSlugs(pendientes, ocupados);

  if (dryRun) {
    console.log(`${planes.length} slug(s) planificado(s) (dry-run, no se escribe nada):`);
    for (const plan of planes) {
      console.log(`  empresa=${plan.empresaId}  producto=${plan.productoId}  slug=${plan.slug}`);
    }
    return;
  }

  const pendientesPorId = new Map(pendientes.map((p) => [p.id, p] as const));
  const resumen = await aplicarPlan(supabase, planes, pendientesPorId);
  console.log(
    `Listo: ${resumen.ok} asignado(s), ${resumen.reintentado} reasignado(s) tras colisión, ${resumen.fallido} fallido(s).`,
  );
}

// Solo corre al ejecutarse directamente (`tsx scripts/backfill-product-slugs.ts`),
// nunca al importarse — el test de `planificarSlugs` importa este módulo sin
// querer disparar I/O contra Supabase.
const esEjecucionDirecta = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
