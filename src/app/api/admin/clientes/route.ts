import { NextRequest } from 'next/server';
import { clienteUseCase } from '@/core/infrastructure/database';
import { createClienteSchema, updateClienteSchema, clienteIdSchema } from '@/core/application/dtos/cliente.dto';
import { requireAuth, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const result = await clienteUseCase.getAll(empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { clientes: result.data } });
}

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = createClienteSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  if (!parsed.data.nombre && !parsed.data.email && !parsed.data.telefono) {
    return validationErrorResponse('Al menos un campo es requerido');
  }

  const result = await clienteUseCase.createOrUpdate(parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  const status = result.data.isUpdate ? 200 : 201;
  return handleResultWithStatus({ success: true, data: { cliente: result.data.cliente, isUpdate: result.data.isUpdate } }, status);
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
  const parsed = updateClienteSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const { id, ...updateData } = parsed.data;
  const result = await clienteUseCase.update(id, empresaId!, updateData);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
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
  const parsed = clienteIdSchema.safeParse({ id: (body as Record<string, unknown>).id });

  if (!parsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const result = await clienteUseCase.delete(parsed.data.id, empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
