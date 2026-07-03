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
});

const bodySchema = z.object({
  mesaId: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(50),
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
  const pedidosRes = await supabase
    .from('pedidos')
    .select('id, numero_pedido, detalle_pedido, total, estado, created_at')
    .eq('empresa_id', empresaId)
    .eq('sesion_id', sesionId)
    .neq('estado', 'cancelado')   // show all non-cancelled: pending, in kitchen, ready, served
    .order('created_at');

  if (pedidosRes.error) return NextResponse.json({ error: pedidosRes.error.message }, { status: 500 });

  type RawItem = { nombre?: string; precio?: number; cantidad?: number; complementos?: string[] };
  type RawPedido = { id: string; numero_pedido: number; detalle_pedido: RawItem[]; total: number; estado: string };

  const orders = ((pedidosRes.data ?? []) as RawPedido[]).map(p => ({
      id: p.id,
      numeroPedido: p.numero_pedido,
      estado: p.estado,
      items: (p.detalle_pedido ?? []).map(it => ({
        nombre: it.nombre ?? '',
        precio: Number(it.precio ?? 0),
        cantidad: Number(it.cantidad ?? 1),
        complementos: it.complementos ?? [],
      })),
      total: Number(p.total),
    }));

  return NextResponse.json(orders);
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

  const { mesaId, items } = parsed.data;

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
        selectedComplements: it.complementos.map(c => ({ id: c, name: c, price: 0 })),
      })),
    },
    mesa.numero,
    mesa.nombre ?? null,
    'pendiente'
  );

  if (!pedidoResult.success) {
    return NextResponse.json({ error: pedidoResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    numeroPedido: pedidoResult.data.numero_pedido,
    pedidoId: pedidoResult.data.id,
  }, { status: 201 });
}
