import { NextRequest } from 'next/server';
import { productUseCase } from '@/core/infrastructure/database';
import { createProductSchema, updateProductSchema, productIdSchema } from '@/core/application/dtos/product.dto';
import { requireAuth, requireRole, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
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
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await productUseCase.getAll(empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  // Transform to admin UI format
  const adminProducts = result.data.map(toAdminProduct);
  return handleResult({ success: true, data: adminProducts });
}

export async function POST(request: NextRequest) {
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
  const parsed = createProductSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await productUseCase.create(parsed.data);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResultWithStatus({ success: true, data: toAdminProduct(result.data) }, 201);
}

export async function PUT(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const queryEmpresaId = searchParams.get('empresaId');
  const idParsed = productIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

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

  const result = await productUseCase.update(idParsed.data.id, empresaId!, parsed.data);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: toAdminProduct(result.data) });
}

export async function DELETE(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const queryEmpresaId = searchParams.get('empresaId');
  const idParsed = productIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;
  const result = await productUseCase.delete(idParsed.data.id, empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
