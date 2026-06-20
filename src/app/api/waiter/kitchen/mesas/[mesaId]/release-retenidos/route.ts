import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export const dynamic = 'force-dynamic';

const mesaIdSchema = z.string().uuid('mesaId debe ser un UUID válido');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { mesaId } = await params;
  if (!mesaIdSchema.safeParse(mesaId).success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // 1. Find active session for this mesa
  const { data: session } = await supabase
    .from('mesa_sesiones')
    .select('id')
    .eq('mesa_id', mesaId)
    .eq('empresa_id', empresaId)
    .is('cerrada_at', null)
    .maybeSingle();

  if (!session) return NextResponse.json({ ok: true, released: 0 });

  // 2. Find all non-closed pedidos in the session
  const { data: pedidos, error: pedidosError } = await supabase
    .from('pedidos')
    .select('id, estado, detalle_pedido')
    .eq('sesion_id', (session as { id: string }).id)
    .neq('estado', 'cerrado');

  if (pedidosError) return NextResponse.json({ error: 'Error al obtener pedidos' }, { status: 500 });
  if (!pedidos?.length) return NextResponse.json({ ok: true, released: 0 });

  const pedidoIds = (pedidos as { id: string }[]).map(p => p.id);

  // 3. Fetch existing per-item estados
  const { data: existingEstados } = await supabase
    .from('pedido_item_estados')
    .select('pedido_id, item_idx, estado')
    .in('pedido_id', pedidoIds);

  const estadoMap = new Map<string, Map<number, string>>();
  for (const row of (existingEstados ?? []) as { pedido_id: string; item_idx: number; estado: string }[]) {
    if (!estadoMap.has(row.pedido_id)) estadoMap.set(row.pedido_id, new Map());
    estadoMap.get(row.pedido_id)!.set(row.item_idx, row.estado);
  }

  // 4. Collect all effectively-retenido items (same logic as fetchAllComidaItems)
  const toRelease: { pedido_id: string; item_idx: number }[] = [];

  for (const pedido of pedidos as { id: string; estado: string; detalle_pedido: unknown[] }[]) {
    const defaultEstado = pedido.estado === 'retenido' ? 'retenido' : 'pendiente';
    const overrides = estadoMap.get(pedido.id) ?? new Map<number, string>();
    const detalle = pedido.detalle_pedido ?? [];

    detalle.forEach((_: unknown, idx: number) => {
      const effective = overrides.get(idx) ?? defaultEstado;
      if (effective === 'retenido') {
        toRelease.push({ pedido_id: pedido.id, item_idx: idx });
      }
    });
  }

  if (!toRelease.length) return NextResponse.json({ ok: true, released: 0 });

  // 5. Batch upsert to pendiente
  const upserts = toRelease.map(({ pedido_id, item_idx }) => ({
    pedido_id,
    item_idx,
    empresa_id: empresaId,
    estado: 'pendiente' as const,
    updated_at: new Date().toISOString(),
    from_validation: false,
  }));

  const { error: upsertError } = await supabase
    .from('pedido_item_estados')
    .upsert(upserts, { onConflict: 'pedido_id,item_idx' });

  if (upsertError) return NextResponse.json({ error: 'Error al liberar ítems' }, { status: 500 });

  return NextResponse.json({ ok: true, released: toRelease.length });
}
