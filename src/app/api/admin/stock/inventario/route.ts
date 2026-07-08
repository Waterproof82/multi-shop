import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const itemSchema = z.object({
  ingredienteId: z.string().uuid(),
  cantidadReal: z.number().min(0),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
  operadorNombre: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const { items, operadorNombre: _operadorNombre } = parsed.data;
  const supabase = getSupabaseClient();

  const ids = items.map(i => i.ingredienteId);
  const { data: ingredientes, error: fetchErr } = await supabase
    .from('ingredientes')
    .select('id, cantidad_actual')
    .eq('empresa_id', empresaId)
    .in('id', ids);

  if (fetchErr || !ingredientes) {
    return NextResponse.json({ error: 'Error al leer ingredientes' }, { status: 500 });
  }

  const actualMap = new Map(
    (ingredientes as { id: string; cantidad_actual: number }[]).map(i => [i.id, Number(i.cantidad_actual)])
  );

  const deltas = items
    .map(item => ({
      ingredienteId: item.ingredienteId,
      cantidadReal: item.cantidadReal,
      delta: item.cantidadReal - (actualMap.get(item.ingredienteId) ?? 0),
    }))
    .filter(d => Math.abs(d.delta) > 0.0001);

  if (deltas.length === 0) {
    return NextResponse.json({ ok: true, ajustados: 0 });
  }

  const movimientos = deltas.map(d => ({
    empresa_id: empresaId,
    ingrediente_id: d.ingredienteId,
    tipo: 'inventario' as const,
    cantidad: d.delta,
  }));

  const { error: movErr } = await supabase
    .from('movimientos_stock')
    .insert(movimientos);

  if (movErr) {
    return NextResponse.json({ error: 'Error al registrar movimientos' }, { status: 500 });
  }

  await Promise.all(
    deltas.map(d =>
      supabase
        .from('ingredientes')
        .update({ cantidad_actual: d.cantidadReal })
        .eq('id', d.ingredienteId)
        .eq('empresa_id', empresaId)
    )
  );

  return NextResponse.json({ ok: true, ajustados: deltas.length });
}
