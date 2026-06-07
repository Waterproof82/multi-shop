import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  validationErrorResponse,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { createGlovoOrderUseCase } from '@/core/application/use-cases/glovo/createGlovoOrderUseCase';

const schema = z.object({
  pedidoId: z.string().uuid(),
});

/**
 * POST /api/glovo/order
 * Admin manual dispatch — triggers a Glovo order for a paid pedido.
 * Normally auto-dispatched by the Redsys webhook; this is a manual override.
 */
export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request) as AuthResult;
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const supabase = getSupabaseClient();
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select('id, total, numero_pedido, payment_order_ref, direccion_entrega, latitude_entrega, longitude_entrega, clientes(nombre, telefono)')
    .eq('id', parsed.data.pedidoId)
    .eq('empresa_id', empresaId!)
    .maybeSingle();

  if (pedidoError || !pedido) {
    return validationErrorResponse('Pedido no encontrado');
  }

  const p = pedido as Record<string, unknown>;
  const cliente = (p['clientes'] as Record<string, unknown> | null) ?? {};

  const result = await createGlovoOrderUseCase({
    empresaId: empresaId!,
    pedidoId: parsed.data.pedidoId,
    clientOrderId: (p['payment_order_ref'] as string | null) ?? parsed.data.pedidoId,
    recipientName: (cliente['nombre'] as string | null) ?? 'Cliente',
    recipientPhone: (cliente['telefono'] as string | null) ?? '',
    recipientAddress: (p['direccion_entrega'] as string | null) ?? '',
    recipientLatitude: (p['latitude_entrega'] as number | null) ?? 0,
    recipientLongitude: (p['longitude_entrega'] as number | null) ?? 0,
    orderTotal: (p['total'] as number | null) ?? 0,
    orderDescription: `Pedido #${p['numero_pedido'] as number}`,
  });

  return handleResult(result);
}
