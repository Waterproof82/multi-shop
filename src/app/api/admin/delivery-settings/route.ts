import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  validationErrorResponse,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { UpdateDeliverySettingsDtoSchema } from '@/core/application/dtos/delivery-settings.dto';
import { getDeliverySettingsUseCase } from '@/core/application/use-cases/delivery/getDeliverySettingsUseCase';
import { updateDeliverySettingsUseCase } from '@/core/application/use-cases/delivery/updateDeliverySettingsUseCase';

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await getDeliverySettingsUseCase(empresaId!);
  return handleResult(result);
}

export async function PUT(request: NextRequest) {
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

  const parsed = UpdateDeliverySettingsDtoSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const result = await updateDeliverySettingsUseCase(empresaId!, parsed.data);
  return handleResult(result);
}
