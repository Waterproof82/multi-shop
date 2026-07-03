import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoUseCase, mesaUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';

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
