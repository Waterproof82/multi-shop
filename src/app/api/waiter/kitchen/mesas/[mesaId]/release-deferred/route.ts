import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionUseCase, pedidoUseCase, mesaRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

const mesaIdSchema = z.string().uuid('mesaId debe ser un UUID válido');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  // Verify mesa belongs to this empresa
  const mesaResult = await mesaRepository.findById(parsed.data);
  if (!mesaResult.success) return NextResponse.json({ error: 'Error al buscar mesa' }, { status: 500 });
  if (!mesaResult.data) return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  if (mesaResult.data.empresaId !== empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Get deferred items
  const deferredResult = await mesaSesionUseCase.getDeferredItems(parsed.data);
  if (!deferredResult.success) return NextResponse.json({ error: 'Error al obtener ítems retenidos' }, { status: 500 });
  if (deferredResult.data.length === 0) return NextResponse.json({ ok: true, created: false });

  // Convert to order items and create pedido
  const items = deferredResult.data.map(d => ({
    item: { id: d.itemId, name: d.itemName, price: d.price, translations: d.translations },
    quantity: d.quantity,
    selectedComplements: d.selectedComplements,
  }));

  const orderResult = await pedidoUseCase.createMesaOrder(
    empresaId,
    { items, mesa_id: parsed.data },
    mesaResult.data.numero,
    mesaResult.data.nombre
  );
  if (!orderResult.success) return NextResponse.json({ error: 'Error al crear pedido' }, { status: 500 });

  // Clear deferred list
  await mesaSesionUseCase.setDeferredItems(parsed.data, []);

  return NextResponse.json({ ok: true, created: true, numeroPedido: orderResult.data.numero_pedido });
}
