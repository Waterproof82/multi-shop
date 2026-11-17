import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';
import { getKitLoteEditorUseCase } from '@/core/application/use-cases/kits/getKitLoteEditor.use-case';
import { replaceKitLoteCaducidadesUseCase } from '@/core/application/use-cases/kits/replaceKitLoteCaducidades.use-case';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await getKitLoteEditorUseCase(getKitCaducidadRepository(), ctx.empresaId, id);
  return handleResult(result);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await replaceKitLoteCaducidadesUseCase(getKitCaducidadRepository(), ctx.empresaId, id, body);
  return handleResult(result);
}
