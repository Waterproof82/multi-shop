/**
 * Cobertura del configurador de personas (kits) — dos capas:
 *
 * 1. ESTATICA (siempre corre, como productos-anon-grant-sync): la migración
 *    declara el vocabulario de reglas que `escala-people.ts` entiende, el
 *    CHECK todo-o-nada de productos, el fallback del trigger y NO concede
 *    nada nuevo a anon.
 *
 * 2. DB VIVA, READ-ONLY (se salta sin env — no corra en pnpm test "a
 *    ciegas"): todo producto con configurador (personas_min NOT NULL) debe
 *    tener receta 100% cubierta — cada fila con regla válida y no nula,
 *    tabla_fila dentro del rango de tabla_info y sin duplicados (dos filas
 *    de receta apuntando a la misma fila de tabla harían el escalado
 *    ambiguo). Los dos kits de KEC, si ya tienen backfill, además deben
 *    traer los límites del brief del owner (min 1 / max 10 / paso 100 €).
 *
 *    Correrla contra la DB real:
 *      node --env-file=.env.local ./node_modules/vitest/vitest.mjs run tests/compliance/store-people-config-coverage.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseRegla } from '@/lib/catalogo/escala-people';

const ROOT = resolve(__dirname, '../..');
const MIGRACION = readFileSync(
  join(ROOT, 'supabase/migrations/20261114000001_store_people_configurator.sql'),
  'utf8'
);

describe('store-people-config — migración estática', () => {
  it('el vocabulario del CHECK es el que parseRegla entiende (sin por_persona:C)', () => {
    // El CHECK completo, línea a línea: NULL | 'por_persona' | 'compartido' | pack:C.
    expect(MIGRACION).toMatch(
      /regla_personas IS NULL\s*\n\s*OR regla_personas IN \('por_persona', 'compartido'\)\s*\n\s*OR regla_personas ~ '\^pack:\[0-9\]\+\$'/
    );
    // "C por persona" se modela con base C y regla 'por_persona' (ración del
    // Plus): el CHECK nunca debe aceptar un valor 'por_persona:C' (los
    // comentarios de la migración lo mencionan para documentarlo — esta
    // aserción mira la LISTA del IN, no el texto libre).
    expect(MIGRACION).not.toMatch(/IN \((?:[^()]|'[^']*')*por_persona:/);
  });

  it('productos.personas_* es todo-o-nada (CHECK) y el trigger cae a personas_min', () => {
    expect(MIGRACION).toContain('productos_personas_config_check');
    expect(MIGRACION).toMatch(/personas_min IS NULL AND personas_max IS NULL AND personas_paso_cents IS NULL/);
    expect(MIGRACION).toMatch(/->>'personas'/);
    expect(MIGRACION).toMatch(/COALESCE\(\s*\n?\s*\(p\.detalle_pedido->NEW\.item_idx->>'personas'\)::int,\s*\n?\s*prod\.personas_min,\s*\n?\s*1/);
  });

  it('no concede columnas nuevas a anon (productos-anon-grant-sync queda intacto)', () => {
    expect(MIGRACION).not.toMatch(/^GRANT/im);
  });
});

// ─── Capa 2: DB viva, read-only ──────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIENE_DB = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Kits de KEC con configurador del brief del owner (2026-11-13). Solo se
// exigen sus límites SI ya tienen backfill (si no, no tienen config y las
// invariantes generales no llegan a tocarlos).
const KITS_KEC: Record<string, { min: number; max: number; pasoCents: number }> = {
  'kit-estandar-72h': { min: 1, max: 10, pasoCents: 10000 },
  'kit-estandar-plus-72h': { min: 1, max: 10, pasoCents: 10000 },
};

interface ProductoConfig {
  id: string;
  slug: string | null;
  personas_min: number;
  personas_max: number;
  personas_paso_cents: number;
  tabla_info: { filas?: unknown[] } | null;
}

interface RecetaFila {
  producto_id: string;
  regla_personas: string | null;
  tabla_fila: number | null;
}

describe.skipIf(!TIENE_DB)('store-people-config — cobertura en la DB viva (read-only)', () => {
  it('todo producto con configurador tiene receta 100% cubierta (regla válida, tabla_fila en rango, sin duplicados)', async () => {
    const db: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_KEY!);

    const { data: productos, error: errorProductos } = await db
      .from('productos')
      .select('id, slug, personas_min, personas_max, personas_paso_cents, tabla_info')
      .not('personas_min', 'is', null);
    expect(errorProductos).toBeNull();

    const configurados = (productos ?? []) as ProductoConfig[];

    const { data: recetas, error: errorRecetas } = await db
      .from('receta_items')
      .select('producto_id, regla_personas, tabla_fila')
      .in('producto_id', configurados.map(p => p.id));
    expect(errorRecetas).toBeNull();

    const recetasPorProducto = new Map<string, RecetaFila[]>();
    for (const fila of (recetas ?? []) as RecetaFila[]) {
      const grupo = recetasPorProducto.get(fila.producto_id) ?? [];
      grupo.push(fila);
      recetasPorProducto.set(fila.producto_id, grupo);
    }

    for (const producto of configurados) {
      const filasTabla = producto.tabla_info?.filas?.length ?? 0;
      const filas = recetasPorProducto.get(producto.id) ?? [];

      // Sin receta no hay nada que escalar: el configurador sería un contador
      // que solo cambia el precio. No está permitido.
      expect(filas.length, `${producto.slug}: producto con configurador sin receta`).toBeGreaterThan(0);

      for (const fila of filas) {
        expect(
          parseRegla(fila.regla_personas),
          `${producto.slug}: regla_personas "${fila.regla_personas}" no es válida (CHECK DB debería haberla rechazado)`
        ).not.toBeNull();
        if (fila.tabla_fila !== null) {
          expect(
            fila.tabla_fila,
            `${producto.slug}: tabla_fila ${fila.tabla_fila} fuera de rango (tabla_info tiene ${filasTabla} filas)`
          ).toBeGreaterThanOrEqual(0);
          expect(fila.tabla_fila, `${producto.slug}: tabla_fila fuera de rango`).toBeLessThan(filasTabla);
        }
      }

      const enlaces = filas.map(f => f.tabla_fila).filter((f): f is number => f !== null);
      expect(new Set(enlaces).size, `${producto.slug}: dos filas de receta apuntan a la misma fila de tabla`).toBe(enlaces.length);

      // Límites del brief del owner para los dos kits de KEC (post-backfill).
      const esperado = producto.slug !== null ? KITS_KEC[producto.slug] : undefined;
      if (esperado) {
        expect(producto.personas_min, `${producto.slug}: personas_min`).toBe(esperado.min);
        expect(producto.personas_max, `${producto.slug}: personas_max`).toBe(esperado.max);
        expect(producto.personas_paso_cents, `${producto.slug}: personas_paso_cents`).toBe(esperado.pasoCents);
      }
    }
  });
});
