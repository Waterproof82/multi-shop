// sdd pet-id-qr-profile, Fase 5/7 — DD12: puerta `resolveMascotasAdminContext`
// (calco de `api/admin/kits/lotes/route.ts`). El GET (listado, Fase 7) se
// deferred desde PR6 hasta que la UI de PR7 lo necesitara.
import { NextRequest } from 'next/server';
import { resolveMascotasAdminContext } from '@/core/infrastructure/api/mascotas-admin-context';
import { handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getPetChapaAdminRepository } from '@/core/infrastructure/database';
import { crearLoteChapasUseCase } from '@/core/application/use-cases/mascotas/crearLoteChapas.use-case';
import { listarLotesChapaUseCase } from '@/core/application/use-cases/mascotas/listarLotesChapa.use-case';

export async function GET(req: NextRequest) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  const q = new URL(req.url).searchParams;
  const result = await listarLotesChapaUseCase(getPetChapaAdminRepository(), ctx.empresaId, {
    page: q.get('page') ?? undefined,
    pageSize: q.get('pageSize') ?? undefined,
  });
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await crearLoteChapasUseCase(getPetChapaAdminRepository(), ctx.empresaId, body);
  return handleResultWithStatus(result, 201);
}
