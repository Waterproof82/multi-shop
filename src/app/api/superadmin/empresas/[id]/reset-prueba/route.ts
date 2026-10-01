import { NextRequest } from 'next/server';
import { getSuperAdminUseCase } from '@/core/infrastructure/database';
import { requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Borra pedidos, cobros, turnos y clientes de una empresa de prueba.
 * La autorización real está en la BD: `reset_empresa_prueba()` rechaza toda
 * empresa con `es_prueba = false` o que envíe registros a VeriFactu.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const roleError = requireRole(request, ['superadmin']);
  if (roleError) return roleError;

  const { id } = await params;
  if (!UUID.test(id)) {
    return validationErrorResponse('Empresa no válida');
  }

  const actor = `superadmin:${request.headers.get('x-admin-id') ?? 'desconocido'}`;
  const result = await getSuperAdminUseCase().resetEmpresaPrueba(id, actor);
  return handleResult(result);
}
