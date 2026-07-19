import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, validationErrorResponse, type AuthResult } from '@/core/infrastructure/api/helpers';
import { getTpvRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { type TpvDetalleItem } from '@/core/domain/entities/tpv-types';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';

const schema = z.object({
  cobroId: z.string().uuid(),
});

type CobrosRow = {
  id: string;
  empresa_id: string;
  turno_id: string;
  metodo_pago: string;
  importe_cobrado_cents: number;
  propina_cents: number;
  iva_porcentaje: string;
  rectifica_cobro_id: string | null;
  detalle_items: TpvDetalleItem[] | null;
};

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  // CSRF check is done by the proxy — no need to re-verify here

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const supabase = getSupabaseClient();

  // 1. Fetch original cobro — must belong to this empresa
  const { data: original, error: fetchErr } = await supabase
    .from('tpv_cobros')
    .select('id, empresa_id, turno_id, metodo_pago, importe_cobrado_cents, propina_cents, iva_porcentaje, rectifica_cobro_id, detalle_items')
    .eq('id', parsed.data.cobroId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (fetchErr || !original) {
    return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 });
  }

  const orig = original as CobrosRow;

  if (orig.rectifica_cobro_id !== null) {
    return NextResponse.json({ error: 'Un rectificativo no puede ser rectificado de nuevo' }, { status: 422 });
  }

  // 2. Check there's no existing rectificativo for this cobro
  const { count } = await supabase
    .from('tpv_cobros')
    .select('*', { count: 'exact', head: true })
    .eq('rectifica_cobro_id', orig.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Este cobro ya tiene un rectificativo emitido' }, { status: 422 });
  }

  // 3. Get active turno for this empresa
  const repo = getTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);
  if (!turnoResult.success || !turnoResult.data) {
    return NextResponse.json({ error: 'No hay turno activo' }, { status: 422 });
  }

  // 4. Create rectificativo cobro (negative amounts)
  const result = await repo.crearCobroCompleto({
    empresaId,
    turnoId: turnoResult.data.id,
    sesionId: null,
    metodoPago: orig.metodo_pago as 'efectivo' | 'tarjeta',
    importeCobradoCents: -orig.importe_cobrado_cents,
    propinaCents: -orig.propina_cents,
    ivaPorcentaje: Number(orig.iva_porcentaje),
    rectificaCobroId: orig.id,
    detalleItems: orig.detalle_items ?? undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Error al crear el rectificativo' }, { status: 500 });
  }

  const actor = resolveActor(req);
  void getAuditLogRepository().insert({
    empresaId,
    action: 'tpv.cobro.rectificar',
    payload: { turnoId: turnoResult.data.id, cobroId: orig.id },
    ...actor,
  });

  return NextResponse.json(result.data, { status: 201 });
}
