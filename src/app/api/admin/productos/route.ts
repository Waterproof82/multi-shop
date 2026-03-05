import { NextRequest } from 'next/server';
import { z } from 'zod';
import { productUseCase } from '@/core/infrastructure/database';
import { createProductSchema, updateProductSchema, productIdSchema } from '@/core/application/dtos/product.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const products = await productUseCase.getAll(empresaId!);
    return successResponse(products);
  } catch {
    return errorResponse('Error al obtener productos');
  }
}

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = createProductSchema.safeParse({ ...body, empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    const product = await productUseCase.create(parsed.data);
    return successResponse(product, 201);
  } catch {
    return errorResponse('Error al crear producto');
  }
}

export async function PUT(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = productIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const body = await request.json();
  const { id: _bodyId, ...updateData } = body;
  const parsed = updateProductSchema.safeParse(updateData);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    const product = await productUseCase.update(idParsed.data.id, empresaId!, parsed.data);
    return successResponse(product);
  } catch {
    return errorResponse('Error al actualizar producto');
  }
}

export async function DELETE(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = productIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  try {
    await productUseCase.delete(idParsed.data.id, empresaId!);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al eliminar producto');
  }
}
