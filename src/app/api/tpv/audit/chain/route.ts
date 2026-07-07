import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { requireAuth, requireRole, type AuthResult } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

// Replicates the Postgres trigger hash formula exactly:
// serie|empresa_id|numero_ticket|importe_cobrado_cents|metodo_pago|cobrado_at_formatted|hash_anterior
function formatCobradoAt(cobradoAt: string): string {
  // to_char(cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') in Supabase UTC session
  return new Date(cobradoAt).toISOString().replace(/\.\d+Z$/, 'Z');
}

function computeHash(row: {
  serie: string;
  empresa_id: string;
  numero_ticket: number;
  importe_cobrado_cents: number;
  metodo_pago: string;
  cobrado_at: string;
  hash_anterior: string | null;
}): string {
  const payload = [
    row.serie,
    row.empresa_id,
    String(row.numero_ticket),
    String(row.importe_cobrado_cents),
    row.metodo_pago,
    formatCobradoAt(row.cobrado_at),
    row.hash_anterior ?? 'INICIO',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

type CobrosRow = {
  id: string;
  serie: string;
  empresa_id: string;
  numero_ticket: number;
  importe_cobrado_cents: number;
  metodo_pago: string;
  cobrado_at: string;
  hash_anterior: string | null;
  hash: string;
};

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 401 });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tpv_cobros')
    .select('id, serie, empresa_id, numero_ticket, importe_cobrado_cents, metodo_pago, cobrado_at, hash_anterior, hash')
    .eq('empresa_id', empresaId)
    .order('numero_ticket', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as CobrosRow[];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, total: 0, message: 'Sin cobros registrados' });
  }

  let firstError: { ticket: number; stored: string; computed: string } | null = null;
  let checked = 0;

  for (const row of rows) {
    const computed = computeHash(row);
    if (computed !== row.hash) {
      firstError = {
        ticket: row.numero_ticket,
        stored: row.hash,
        computed,
      };
      break;
    }
    checked++;
  }

  if (firstError !== null) {
    return NextResponse.json({
      ok: false,
      total: rows.length,
      checked,
      error: `Integridad comprometida en ticket #${firstError.ticket}`,
      detail: firstError,
    }, { status: 200 });
  }

  return NextResponse.json({ ok: true, total: rows.length, checked: rows.length });
}
