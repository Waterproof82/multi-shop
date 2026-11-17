import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';
import { loteIdQuerySchema } from '@/core/application/dtos/kit-caducidad.dto';
import { listLineasCandidatasUseCase } from '@/core/application/use-cases/kits/listLineasCandidatas.use-case';

export async function GET(req: NextRequest) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const q = new URL(req.url).searchParams;
  const parsed = loteIdQuerySchema.safeParse({ loteId: q.get('loteId') });
  if (!parsed.success) return validationErrorResponse(parsed.error.message);

  const result = await listLineasCandidatasUseCase(getKitCaducidadRepository(), ctx.empresaId, parsed.data.loteId);
  return handleResult(result);
}
