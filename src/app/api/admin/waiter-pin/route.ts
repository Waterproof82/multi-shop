import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getEmpresaRepository } from '@/core/infrastructure/database';
import { resolveAdminContext, successResponse, validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { hashPin } from '@/lib/waiter-auth';

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'El PIN debe tener entre 4 y 8 dígitos'),
});

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const pinHash = await hashPin(parsed.data.pin, empresaId!);
  const result = await getEmpresaRepository().updateWaiterPin(empresaId!, pinHash);
  if (!result.success) return handleResult(result);

  return successResponse({ success: true });
}
