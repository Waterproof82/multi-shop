import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, type AuthResult } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde'); // YYYY-MM-DD
  const hasta = searchParams.get('hasta'); // YYYY-MM-DD

  const supabase = getSupabaseClient();

  let query = supabase
    .from('tpv_cobros')
    .select(
      'id, serie, numero_ticket, metodo_pago, importe_cobrado_cents, propina_cents, iva_porcentaje, base_imponible_cents, iva_cents, hash_anterior, hash, cobrado_at, turno_id, sesion_id'
    )
    .eq('empresa_id', empresaId)
    .order('numero_ticket', { ascending: true });

  if (desde) query = query.gte('cobrado_at', `${desde}T00:00:00Z`);
  if (hasta) query = query.lte('cobrado_at', `${hasta}T23:59:59Z`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];

  const exportData = {
    exported_at: new Date().toISOString(),
    empresa_id: empresaId,
    periodo: { desde: desde ?? 'inicio', hasta: hasta ?? 'hoy' },
    total: rows.length,
    cobros: rows.map(r => ({
      id: r.id,
      serie: r.serie,
      numero_ticket: r.numero_ticket,
      metodo_pago: r.metodo_pago,
      importe_cobrado_cents: r.importe_cobrado_cents,
      propina_cents: r.propina_cents,
      iva_porcentaje: r.iva_porcentaje,
      base_imponible_cents: r.base_imponible_cents,
      iva_cents: r.iva_cents,
      hash_anterior: r.hash_anterior,
      hash: r.hash,
      cobrado_at: r.cobrado_at,
      turno_id: r.turno_id,
      sesion_id: r.sesion_id,
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tpv-cobros-${empresaId}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
