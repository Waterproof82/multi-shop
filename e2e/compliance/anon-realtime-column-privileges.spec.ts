/**
 * E2E — Anon Realtime tables: column-privilege enforcement (RGPD Art.5/32, OWASP A01)
 *
 * Historial: la migración 20260627000001_realtime_anon_select_policies.sql añadió
 * policies RLS `USING(true)` para `anon` en pedidos, mesa_sesiones y
 * pedido_item_estados, con la intención de que Realtime postgres_changes llegara
 * a suscriptores anon. Pero una policy RLS permisiva también abre la tabla a
 * lectura directa via PostgREST (`GET /rest/v1/pedidos?select=*`), exponiendo
 * datos de TODAS las empresas (direccion_entrega, coordenadas GPS, contenido de
 * pedidos, totales) a cualquiera con la anon key pública.
 *
 * Fix (2026-07-31):
 *   1. 20260731000002_restrict_anon_columns_realtime_tables.sql — GRANT SELECT
 *      column-level, restringiendo anon a solo las columnas mínimas necesarias.
 *   2. 20260731000003_mesa_sesiones_broadcast_trigger.sql +
 *      20260731000004_drop_anon_realtime_select_policies.sql — se reemplazó el
 *      mecanismo de Realtime por Broadcast (payload mínimo, sin RLS SELECT
 *      permisiva) y se eliminaron las policies `USING(true)` por completo.
 *
 * Este test evita que una futura migración vuelva a otorgar SELECT sin
 * restricción de columnas, o vuelva a abrir la policy de fila para anon.
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import { test, expect } from '@playwright/test';

function supabaseUrl(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function anonKey(): string | undefined     { return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }

function anonHeaders() {
  return {
    apikey: anonKey()!,
    Authorization: `Bearer ${anonKey()!}`,
  };
}

const TABLES: Array<{
  table: string;
  allowedColumns: string[];
  sensitiveColumns: string[];
}> = [
  {
    table: 'pedidos',
    allowedColumns: ['id', 'empresa_id', 'mesa_id', 'sesion_id', 'estado', 'created_at'],
    sensitiveColumns: ['direccion_entrega', 'latitude_entrega', 'longitude_entrega', 'detalle_pedido', 'nota', 'total'],
  },
  {
    table: 'mesa_sesiones',
    allowedColumns: ['id', 'empresa_id', 'mesa_id', 'pago_en_curso', 'sesion_pagada', 'cliente_activo', 'llamada_activa'],
    sensitiveColumns: ['total', 'pending_items', 'propina_cents', 'division_base_cents'],
  },
  {
    table: 'pedido_item_estados',
    allowedColumns: ['pedido_id', 'item_idx', 'empresa_id', 'estado'],
    sensitiveColumns: ['updated_at', 'from_validation', 'pase'],
  },
];

test.describe('Anon Realtime tables — column-privilege enforcement', () => {
  test.beforeEach(() => {
    if (!supabaseUrl() || !anonKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no definidos');
    }
  });

  for (const { table } of TABLES) {
    test(`anon con select=* en ${table} → NUNCA 200 con datos (columnas no otorgadas deben bloquear)`, async ({ request }) => {
      const res = await request.get(
        `${supabaseUrl()}/rest/v1/${table}?select=*&limit=1`,
        { headers: anonHeaders() }
      );

      // 401/403 = OK: PostgREST deniega porque select=* pide columnas sin GRANT.
      // 200 con datos = FALLO CRÍTICO: la tabla completa es legible por anon.
      if (res.status() === 200) {
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(0);
      } else {
        expect([401, 403]).toContain(res.status());
      }
    });
  }

  for (const { table, sensitiveColumns } of TABLES) {
    for (const column of sensitiveColumns) {
      test(`anon no puede leer ${table}.${column} via REST → 401/403 (columna no otorgada)`, async ({ request }) => {
        const res = await request.get(
          `${supabaseUrl()}/rest/v1/${table}?select=${column}&limit=1`,
          { headers: anonHeaders() }
        );
        expect([401, 403]).toContain(res.status());
      });
    }
  }

  for (const { table, allowedColumns } of TABLES) {
    test(`anon leyendo columnas mínimas otorgadas de ${table} → 200 con 0 filas (RLS deniega la fila)`, async ({ request }) => {
      const res = await request.get(
        `${supabaseUrl()}/rest/v1/${table}?select=${allowedColumns.join(',')}&limit=1`,
        { headers: anonHeaders() }
      );

      // Las columnas SÍ están otorgadas (necesarias para Realtime/broadcast), pero
      // ninguna policy RLS de fila las expone via REST directo — deben volver 0 filas.
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });
  }
});
