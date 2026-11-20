// sdd pet-id-qr-profile, Fase 5 — DD12: puerta `resolveMascotasAdminContext`
// (calco de `api/admin/kits/lotes/route.ts`).
import { NextRequest } from 'next/server';
import { resolveMascotasAdminContext } from '@/core/infrastructure/api/mascotas-admin-context';
import { handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getPetChapaAdminRepository } from '@/core/infrastructure/database';
import { crearLoteChapasUseCase } from '@/core/application/use-cases/mascotas/crearLoteChapas.use-case';

export async function POST(req: NextRequest) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await crearLoteChapasUseCase(getPetChapaAdminRepository(), ctx.empresaId, body);
  return handleResultWithStatus(result, 201);
}
