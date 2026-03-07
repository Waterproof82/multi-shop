import { NextRequest } from 'next/server';
import { productUseCase } from '@/core/infrastructure/database';
import { createProductSchema, updateProductSchema, productIdSchema } from '@/core/application/dtos/product.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import type { Product } from '@/core/domain/entities/types';

// Transform domain format to admin UI format
function toAdminProduct(prod: Product) {
  return {
    id: prod.id,
    empresa_id: prod.empresaId,
    categoria_id: prod.categoriaId,
    titulo_es: prod.titulo_es,
    titulo_en: prod.titulo_en || null,
    titulo_fr: prod.titulo_fr || null,
    titulo_it: prod.titulo_it || null,
    titulo_de: prod.titulo_de || null,
    descripcion_es: prod.descripcion_es,
    descripcion_en: prod.descripcion_en || null,
    descripcion_fr: prod.descripcion_fr || null,
    descripcion_it: prod.descripcion_it || null,
    descripcion_de: prod.descripcion_de || null,
    precio: prod.precio,
    foto_url: prod.fotoUrl,
    es_especial: prod.esEspecial,
    activo: prod.activo,
  };
}

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const products = await productUseCase.getAll(empresaId!);
    // Transform to admin UI format
    const adminProducts = products.map(toAdminProduct);
    return successResponse(adminProducts);
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
    return successResponse(toAdminProduct(product), 201);
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
  
  // Merge id from query param with body data
  const dataWithId = { ...updateData, id: idParsed.data.id };
  const parsed = updateProductSchema.safeParse(dataWithId);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    const product = await productUseCase.update(idParsed.data.id, empresaId!, parsed.data);
    return successResponse(toAdminProduct(product));
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
