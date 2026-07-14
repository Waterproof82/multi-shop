import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getMesaRepository, getMesaSesionUseCase, getPedidoRepository } from '@/core/infrastructure/database';
import { resolveAdminContext, successResponse, validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';

const createMesaSchema = z.object({
  numero: z.number().int().min(1).max(999),
  nombre: z.string().max(100).optional().nullable(),
});

const deleteMesaSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getMesaSesionUseCase().getMesasWithSessions(empresaId!);
  if (!result.success) return handleResult(result);

  return successResponse({ mesas: result.data });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = createMesaSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const result = await getMesaRepository().create(
    empresaId!,
    parsed.data.numero,
    parsed.data.nombre ?? undefined
  );
  if (!result.success) return handleResult(result);

  return successResponse({ mesa: result.data }, 201);
}

const closeSesionSchema = z.object({
  sesionId: z.string().uuid(),
});

export async function PATCH(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = closeSesionSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse('sesionId inválido');

  const { sesionId } = parsed.data;

  // Consolidate individual orders into a single closed ticket
  await getPedidoRepository().consolidateSesionOrders(sesionId);

  const result = await getMesaSesionUseCase().closeSesion(sesionId);
  if (!result.success) return handleResult(result);

  return successResponse({ success: true });
}

export async function DELETE(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = deleteMesaSchema.safeParse({ id: (body as Record<string, unknown>).id });
  if (!parsed.success) return validationErrorResponse('ID inválido');

  const result = await getMesaRepository().delete(parsed.data.id, empresaId!);
  if (!result.success) return handleResult(result);

  return successResponse({ success: true });
}
