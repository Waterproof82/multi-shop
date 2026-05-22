import { NextRequest } from 'next/server';
import { z } from 'zod';
import { mesaRepository, mesaSesionUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, successResponse, validationErrorResponse, handleResult, type AuthResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

const createMesaSchema = z.object({
  numero: z.number().int().min(1).max(999),
  nombre: z.string().max(100).optional().nullable(),
});

const deleteMesaSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await mesaSesionUseCase.getMesasWithSessions(empresaId!);
  if (!result.success) return handleResult(result);

  return successResponse({ mesas: result.data });
}

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
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

  const parsed = createMesaSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const result = await mesaRepository.create(
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
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { error: authError } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = closeSesionSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse('sesionId inválido');

  const result = await mesaSesionUseCase.closeSesion(parsed.data.sesionId);
  if (!result.success) return handleResult(result);

  return successResponse({ success: true });
}

export async function DELETE(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
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

  const parsed = deleteMesaSchema.safeParse({ id: (body as Record<string, unknown>).id });
  if (!parsed.success) return validationErrorResponse('ID inválido');

  const result = await mesaRepository.delete(parsed.data.id, empresaId!);
  if (!result.success) return handleResult(result);

  return successResponse({ success: true });
}
