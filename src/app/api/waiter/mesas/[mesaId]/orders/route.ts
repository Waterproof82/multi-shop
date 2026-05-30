import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository, pedidoRepository } from '@/core/infrastructure/database';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(parsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar la sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ orders: [], sesionId: null, total: 0 });
  }

  const sesion = sesionResult.data;

  const ordersResult = await pedidoRepository.findBySesionId(sesion.id);
  if (!ordersResult.success) {
    return NextResponse.json({ error: 'Error al obtener los pedidos' }, { status: 500 });
  }

  const orders = ordersResult.data.map(o => ({
    id: o.id,
    numeroPedido: o.numero_pedido,
    items: o.detalle_pedido,
    total: o.total,
    estado: o.estado,
    createdAt: o.created_at,
  }));

  const total = ordersResult.data.reduce((sum, o) => sum + Number(o.total), 0);

  return NextResponse.json({ orders, sesionId: sesion.id, total });
}
