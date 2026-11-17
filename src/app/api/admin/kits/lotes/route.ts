import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';
import { createKitLoteUseCase } from '@/core/application/use-cases/kits/createKitLote.use-case';
import { listKitLotesUseCase } from '@/core/application/use-cases/kits/listKitLotes.use-case';

export async function GET(req: NextRequest) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const q = new URL(req.url).searchParams;
  const result = await listKitLotesUseCase(getKitCaducidadRepository(), ctx.empresaId, {
    page: q.get('page') ?? undefined,
    pageSize: q.get('pageSize') ?? undefined,
  });
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await createKitLoteUseCase(getKitCaducidadRepository(), ctx.empresaId, body);
  return handleResultWithStatus(result, 201);
}
