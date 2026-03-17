import { NextRequest } from 'next/server';
import { categoryUseCase } from '@/core/infrastructure/database';
import { createCategorySchema, updateCategorySchema, categoryIdSchema } from '@/core/application/dtos/category.dto';
import { requireAuth, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import type { Category } from '@/core/domain/entities/types';

// Transform domain format to admin UI format
function toAdminCategory(cat: Category) {
  return {
    id: cat.id,
    empresa_id: cat.empresaId,
    nombre_es: cat.nombre,
    nombre_en: cat.translations?.en || null,
    nombre_fr: cat.translations?.fr || null,
    nombre_it: cat.translations?.it || null,
    nombre_de: cat.translations?.de || null,
    descripcion_es: cat.descripcion,
    descripcion_en: cat.descripcionTranslations?.en || null,
    descripcion_fr: cat.descripcionTranslations?.fr || null,
    descripcion_it: cat.descripcionTranslations?.it || null,
    descripcion_de: cat.descripcionTranslations?.de || null,
    orden: cat.orden || 0,
    categoria_complemento_de: cat.categoriaComplementoDe,
    complemento_obligatorio: cat.complementoObligatorio || false,
    categoria_padre_id: cat.categoriaPadreId,
  };
}

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const result = await categoryUseCase.getAll(empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  // Transform to admin UI format
  const adminCategories = result.data.map(toAdminCategory);
  return handleResult({ success: true, data: adminCategories });
}

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = createCategorySchema.safeParse({ ...body, empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await categoryUseCase.create(parsed.data);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResultWithStatus({ success: true, data: toAdminCategory(result.data) }, 201);
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

  const result = await categoryUseCase.update(idParsed.data.id, empresaId!, parsed.data);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: toAdminCategory(result.data) });
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

  const result = await categoryUseCase.delete(idParsed.data.id, empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
