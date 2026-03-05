import { NextRequest } from 'next/server';
import { categoryUseCase } from '@/core/infrastructure/database';
import { createCategorySchema, updateCategorySchema, categoryIdSchema } from '@/core/application/dtos/category.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const categories = await categoryUseCase.getAll(empresaId!);
    return successResponse(categories);
  } catch {
    return errorResponse('Error al obtener categorías');
  }
}

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = createCategorySchema.safeParse({ ...body, empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    const category = await categoryUseCase.create(parsed.data);
    return successResponse(category, 201);
  } catch {
    return errorResponse('Error al crear categoría');
  }
}

export async function PUT(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = categoryIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const body = await request.json();
  const { id: _bodyId, ...updateData } = body;
  const parsed = updateCategorySchema.safeParse(updateData);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    const category = await categoryUseCase.update(idParsed.data.id, empresaId!, parsed.data);
    return successResponse(category);
  } catch {
    return errorResponse('Error al actualizar categoría');
  }
}

export async function DELETE(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = categoryIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  try {
    await categoryUseCase.delete(idParsed.data.id, empresaId!);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al eliminar categoría');
  }
}
