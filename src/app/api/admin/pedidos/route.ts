import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pedidoUseCase } from '@/core/infrastructure/database';
import { requireAuth, successResponse, validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { PEDIDO_ESTADOS } from '@/core/domain/constants/pedido';

const pedidoIdSchema = z.object({
  id: z.string().uuid(),
});

const updatePedidoSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(PEDIDO_ESTADOS),
});

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const result = await pedidoUseCase.getAll(empresaId!);
  if (!result.success) {
    return handleResult(result);
  }
  return successResponse({ pedidos: result.data });
}

export async function PATCH(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = updatePedidoSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await pedidoUseCase.updateStatus(parsed.data.id, empresaId!, parsed.data.estado);
  if (!result.success) {
    return handleResult(result);
  }
  return successResponse({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = pedidoIdSchema.safeParse({ id: (body as Record<string, unknown>).id });

  if (!parsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const result = await pedidoUseCase.delete(parsed.data.id, empresaId!);
  if (!result.success) {
    return handleResult(result);
  }
  return successResponse({ success: true });
}

export async function PUT(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const mesParam = searchParams.get('mes');
  const añoParam = searchParams.get('año');

  const now = new Date();
  const selectedMonth = mesParam ? Number.parseInt(mesParam) : now.getMonth();
  const selectedYear = añoParam ? Number.parseInt(añoParam) : now.getFullYear();

  const result = await pedidoUseCase.getStats(empresaId!, selectedMonth, selectedYear);
  if (!result.success) {
    return handleResult(result);
  }

  return successResponse({
    ...result.data,
    mesSeleccionado: `${selectedMonth}-${selectedYear}`,
  });
}
