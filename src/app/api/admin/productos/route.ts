import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getProductUseCase } from '@/core/infrastructure/database';
import { createProductSchema, updateProductSchema, productIdSchema } from '@/core/application/dtos/product.dto';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { catalogTag } from '@/lib/cache-tags';
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
    foto_object_fit: prod.fotoObjectFit || 'contain',
    es_especial: prod.esEspecial,
    activo: prod.activo,
    tipo_producto: prod.tipoProducto,
    porcentaje_impuesto_override: prod.porcentajeImpuestoOverride ?? null,
  };
}

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId, isSuperAdmin } = ctx;

  if (isSuperAdmin && !empresaId) {
    return validationErrorResponse('empresaId query param required for superadmin');
  }

  if (!empresaId) {
    return validationErrorResponse('Empresa ID required');
  }

  const result = await getProductUseCase().getAll(empresaId);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  // Transform to admin UI format
  const adminProducts = result.data.map(toAdminProduct);
  return handleResult({ success: true, data: adminProducts });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId, isSuperAdmin } = ctx;

  if (isSuperAdmin && !empresaId) {
    return validationErrorResponse('empresaId query param required for superadmin');
  }

  if (!empresaId) {
    return validationErrorResponse('Empresa ID required');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = createProductSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getProductUseCase().create(parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  revalidateTag(catalogTag(empresaId), {});
  return handleResultWithStatus({ success: true, data: toAdminProduct(result.data) }, 201);
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId, isSuperAdmin } = ctx;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = productIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  if (isSuperAdmin && !empresaId) {
    return validationErrorResponse('empresaId query param required for superadmin');
  }

  if (!empresaId) {
    return validationErrorResponse('Empresa ID required');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const { id: _bodyId, ...updateData } = body as Record<string, unknown>;

  // Merge id from query param with body data
  const dataWithId = { ...updateData, id: idParsed.data.id };
  const parsed = updateProductSchema.safeParse(dataWithId);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getProductUseCase().update(idParsed.data.id, empresaId, parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  revalidateTag(catalogTag(empresaId), {});
  return handleResult({ success: true, data: toAdminProduct(result.data) });
}

export async function DELETE(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId, isSuperAdmin } = ctx;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = productIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  if (isSuperAdmin && !empresaId) {
    return validationErrorResponse('empresaId query param required for superadmin');
  }

  if (!empresaId) {
    return validationErrorResponse('Empresa ID required');
  }
  
  const result = await getProductUseCase().delete(idParsed.data.id, empresaId);

  if (!result.success) {
    return handleResult(result);
  }

  revalidateTag(catalogTag(empresaId), {});
  return handleResult({ success: true, data: { success: true } });
}
