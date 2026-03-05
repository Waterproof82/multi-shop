import { NextRequest } from 'next/server';
import { clienteUseCase } from '@/core/infrastructure/database';
import { createClienteSchema, updateClienteSchema, clienteIdSchema } from '@/core/application/dtos/cliente.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const clientes = await clienteUseCase.getAll(empresaId!);
    return successResponse({ clientes });
  } catch {
    return errorResponse('Error al obtener clientes');
  }
}

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = createClienteSchema.safeParse({ ...body, empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  if (!parsed.data.nombre && !parsed.data.email && !parsed.data.telefono) {
    return validationErrorResponse('Al menos un campo es requerido');
  }

  try {
    const cliente = await clienteUseCase.create(parsed.data);
    return successResponse({ cliente }, 201);
  } catch {
    return errorResponse('Error al crear cliente');
  }
}

export async function PATCH(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = updateClienteSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    const { id, ...updateData } = parsed.data;
    await clienteUseCase.update(id, empresaId!, updateData);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al actualizar cliente');
  }
}

export async function DELETE(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = clienteIdSchema.safeParse({ id: body.id });

  if (!parsed.success) {
    return validationErrorResponse('ID inválido');
  }

  try {
    await clienteUseCase.delete(parsed.data.id, empresaId!);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al eliminar cliente');
  }
}
