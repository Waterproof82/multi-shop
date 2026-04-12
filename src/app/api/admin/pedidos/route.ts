import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pedidoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, successResponse, validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';
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

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const mesParam = searchParams.get('mes');
  const añoParam = searchParams.get('año');

  let result;
  if (mesParam !== null && añoParam !== null) {
    const now = new Date();
    const mesSchema = z.coerce.number().int().min(0).max(11);
    const añoSchema = z.coerce.number().int().min(2020).max(2100);
    const selectedMonth = mesSchema.safeParse(mesParam).data ?? now.getMonth();
    const selectedYear = añoSchema.safeParse(añoParam).data ?? now.getFullYear();
    result = await pedidoUseCase.getAllByMonth(empresaId!, selectedMonth, selectedYear);
  } else {
    result = await pedidoUseCase.getAll(empresaId!);
  }

  if (!result.success) {
    return handleResult(result);
  }
  return successResponse({ pedidos: result.data });
}

export async function PATCH(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

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
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

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

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;
  const mesParam = searchParams.get('mes');
  const añoParam = searchParams.get('año');

  const now = new Date();
  const mesSchema = z.coerce.number().int().min(0).max(11);
  const añoSchema = z.coerce.number().int().min(2020).max(2100);

  const selectedMonth = mesParam ? (mesSchema.safeParse(mesParam).data ?? now.getMonth()) : now.getMonth();
  const selectedYear = añoParam ? (añoSchema.safeParse(añoParam).data ?? now.getFullYear()) : now.getFullYear();

  const result = await pedidoUseCase.getStats(empresaId!, selectedMonth, selectedYear);
  if (!result.success) {
    return handleResult(result);
  }

  return successResponse({
    ...result.data,
    mesSeleccionado: `${selectedMonth}-${selectedYear}`,
  });
}
