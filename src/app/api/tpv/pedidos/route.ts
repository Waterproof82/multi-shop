import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoUseCase, mesaUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const itemSchema = z.object({
  productId: z.string().uuid(),
  nombre: z.string().min(1).max(200),
  precio: z.number().nonnegative(),
  cantidad: z.number().int().min(1).max(99),
  complementos: z.array(z.string().max(200)).max(20).optional().default([]),
  nota: z.string().max(500).optional(),
});

const bodySchema = z.object({
  mesaId: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(50),
  nota: z.string().max(500).optional(),
  pase: z.enum(['primer', 'segundo', 'postre', 'bebida']).optional(),
});

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const sesionId = req.nextUrl.searchParams.get('sesionId');
  if (!sesionId || !/^[0-9a-f-]{36}$/.test(sesionId)) {
    return validationErrorResponse('sesionId inválido');
  }

  const supabase = getSupabaseClient();
  const [pedidosRes, cobrosRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero_pedido, detalle_pedido, total, estado, created_at, nota, pase')
      .eq('empresa_id', empresaId)
      .eq('sesion_id', sesionId)
      .neq('estado', 'cancelado')   // show all non-cancelled: pending, in kitchen, ready, served
      .order('created_at'),
    supabase
      .from('tpv_cobros')
      .select('importe_cobrado_cents')
      .eq('sesion_id', sesionId),
  ]);

  if (pedidosRes.error) return NextResponse.json({ error: pedidosRes.error.message }, { status: 500 });

  const yaCobradoCents = ((cobrosRes.data ?? []) as { importe_cobrado_cents: number }[])
    .reduce((sum, c) => sum + Number(c.importe_cobrado_cents), 0);

  type RawComplement = string | { nombre?: string; name?: string };
  type RawItem = { nombre?: string; precio?: number; cantidad?: number; complementos?: RawComplement[] };
  type RawPedido = { id: string; numero_pedido: number; detalle_pedido: RawItem[]; total: number; estado: string; nota?: string | null; pase?: string | null };

  const rawPedidos = (pedidosRes.data ?? []) as RawPedido[];

  // Synthesize effective estado from pedido_item_estados for ALL pedidos.
  // pedidos.estado is never updated by kitchen — the source of truth is pedido_item_estados.
  const synthesizedEstado = new Map<string, string>();
  const allIds = rawPedidos.map(p => p.id);

  if (allIds.length > 0) {
    try {
      const { data: itemEstados } = await supabase
        .from('pedido_item_estados')
        .select('pedido_id, item_idx, estado')
        .in('pedido_id', allIds);

      const overridesByPedido = new Map<string, Map<number, string>>();
      for (const row of (itemEstados ?? []) as { pedido_id: string; item_idx: number; estado: string }[]) {
        if (!overridesByPedido.has(row.pedido_id)) overridesByPedido.set(row.pedido_id, new Map());
        overridesByPedido.get(row.pedido_id)!.set(row.item_idx, row.estado);
      }

      for (const p of rawPedidos) {
        const detalle = (p.detalle_pedido as unknown[]) ?? [];
        const overrides = overridesByPedido.get(p.id) ?? new Map<number, string>();

        if (overrides.size === 0) continue; // No kitchen activity yet, keep original estado

        if (p.estado === 'retenido') {
          // Only synthesize retenido pedidos once ALL items have been released
          const allReleased = detalle.length > 0 && detalle.every((_, idx) => {
            const ov = overrides.get(idx);
            return ov !== undefined && ov !== 'retenido';
          });
          if (!allReleased) continue;
        }

        const itemStates = detalle.map((_, idx) => overrides.get(idx) ?? 'pendiente');
        const allCancelled     = itemStates.length > 0 && itemStates.every(s => s === 'cancelado');
        const allDone          = itemStates.every(s => s === 'servido' || s === 'cancelado');
        const anyListo         = itemStates.some(s => s === 'listo');
        const anyEnPreparacion = itemStates.some(s => s === 'en_preparacion');

        synthesizedEstado.set(p.id,
          allCancelled ? 'cancelado' : allDone ? 'servido' : anyListo ? 'preparado' : anyEnPreparacion ? 'en_preparacion' : 'pendiente'
        );
      }
    } catch { /* best-effort */ }
  }

  function normComplement(c: RawComplement): string {
    if (typeof c === 'string') return c;
    return c.nombre ?? c.name ?? '';
  }

  const orders = rawPedidos
    .filter(p => synthesizedEstado.get(p.id) !== 'cancelado')
    .map(p => ({
      id: p.id,
      numeroPedido: p.numero_pedido,
      estado: synthesizedEstado.get(p.id) ?? p.estado,
      items: (p.detalle_pedido ?? []).map(it => ({
        nombre: it.nombre ?? '',
        precio: Number(it.precio ?? 0),
        cantidad: Number(it.cantidad ?? 1),
        complementos: (it.complementos ?? []).map(normComplement).filter(Boolean),
      })),
      total: Number(p.total),
      nota: p.nota ?? null,
      pase: p.pase ?? null,
    }));

  return NextResponse.json({ orders, yaCobradoCents });
}

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { mesaId, items, nota, pase } = parsed.data;

  const mesaResult = await mesaUseCase.getMesa(mesaId);
  if (!mesaResult.success || !mesaResult.data) {
    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }

  const mesa = mesaResult.data;

  const pedidoResult = await pedidoUseCase.createMesaOrder(
    empresaId,
    {
      mesa_id: mesaId,
      items: items.map(it => ({
        item: { id: it.productId, name: it.nombre, price: it.precio },
        quantity: it.cantidad,
        selectedComplements: it.complementos.map(c => ({ id: '', name: c, price: 0 })),
        ...(it.nota ? { note: it.nota } : {}),
      })),
      nota,
    },
    mesa.numero,
    mesa.nombre ?? null,
    'pendiente'
  );

  if (!pedidoResult.success) {
    return NextResponse.json({ error: pedidoResult.error.message }, { status: 500 });
  }

  // Set pase if provided (best-effort — does not fail the request if update fails)
  if (pase) {
    await getSupabaseClient()
      .from('pedidos')
      .update({ pase })
      .eq('id', pedidoResult.data.id);
  }

  // Fetch the active session created by the use case (needed when mesa was libre)
  const { data: sesionRow } = await getSupabaseClient()
    .from('mesa_sesiones')
    .select('id')
    .eq('mesa_id', mesaId)
    .is('cerrada_at', null)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    numeroPedido: pedidoResult.data.numero_pedido,
    pedidoId: pedidoResult.data.id,
    sesionId: (sesionRow as { id: string } | null)?.id ?? null,
  }, { status: 201 });
}
