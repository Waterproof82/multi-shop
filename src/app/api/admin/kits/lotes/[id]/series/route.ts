import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';
import { generarSeriesLoteUseCase } from '@/core/application/use-cases/kits/generarSeriesLote.use-case';
import { listSeriesLoteUseCase } from '@/core/application/use-cases/kits/listSeriesLote.use-case';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await listSeriesLoteUseCase(getKitCaducidadRepository(), ctx.empresaId, id);
  return handleResult(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await generarSeriesLoteUseCase(getKitCaducidadRepository(), ctx.empresaId, id, body);
  return handleResultWithStatus(result, 201);
}
