import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionUseCase, pedidoUseCase, mesaRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

const mesaIdSchema = z.string().uuid('mesaId debe ser un UUID válido');
const bodySchema   = z.object({ itemIndex: z.number().int().min(0) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { mesaId } = await params;
  const parsedId = mesaIdSchema.safeParse(mesaId);
  if (!parsedId.success) return NextResponse.json({ error: parsedId.error.errors[0].message }, { status: 400 });

  let rawBody: unknown;
  try { rawBody = await request.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });

  // Verify mesa belongs to this empresa
  const mesaResult = await mesaRepository.findById(parsedId.data);
  if (!mesaResult.success) return NextResponse.json({ error: 'Error al buscar mesa' }, { status: 500 });
  if (!mesaResult.data)    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  if (mesaResult.data.empresaId !== empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Get deferred items
  const deferredResult = await mesaSesionUseCase.getDeferredItems(parsedId.data);
  if (!deferredResult.success) return NextResponse.json({ error: 'Error al obtener ítems' }, { status: 500 });

  const { itemIndex } = parsedBody.data;
  if (itemIndex >= deferredResult.data.length) return NextResponse.json({ error: 'Índice fuera de rango' }, { status: 400 });

  const item = deferredResult.data[itemIndex];

  // Create a pedido with just this one item
  const orderResult = await pedidoUseCase.createMesaOrder(
    empresaId,
    {
      items: [{
        item: { id: item.itemId, name: item.itemName, price: item.price, translations: item.translations },
        quantity: item.quantity,
        selectedComplements: item.selectedComplements,
      }],
      mesa_id: parsedId.data,
    },
    mesaResult.data.numero,
    mesaResult.data.nombre
  );
  if (!orderResult.success) return NextResponse.json({ error: 'Error al crear pedido' }, { status: 500 });

  // Remove this item from the deferred list
  const updated = deferredResult.data.filter((_, i) => i !== itemIndex);
  await mesaSesionUseCase.setDeferredItems(parsedId.data, updated);

  return NextResponse.json({ ok: true, numeroPedido: orderResult.data.numero_pedido });
}
