import { NextRequest } from 'next/server';
import {
  resolveAdminContext,
  validationErrorResponse,
  handleResult,
} from '@/core/infrastructure/api/helpers';
import { UpdateDeliverySettingsDtoSchema } from '@/core/application/dtos/delivery-settings.dto';
import { getDeliverySettingsUseCase } from '@/core/application/use-cases/delivery/getDeliverySettingsUseCase';
import { updateDeliverySettingsUseCase } from '@/core/application/use-cases/delivery/updateDeliverySettingsUseCase';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getDeliverySettingsUseCase(empresaId!);
  return handleResult(result);
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

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
