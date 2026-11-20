// sdd pet-id-qr-profile, Fase 5 — DD12: puerta `resolveMascotasAdminContext`
// (calco de `api/admin/kits/lotes/[id]/series/route.ts`). GET = recuento sin
// PII (R-QR.1.2); POST = generar N códigos nuevos con reintento (R-QR.1.1).
import { NextRequest } from 'next/server';
import { resolveMascotasAdminContext } from '@/core/infrastructure/api/mascotas-admin-context';
import { handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getPetChapaAdminRepository } from '@/core/infrastructure/database';
import { generarCodigosChapaUseCase } from '@/core/application/use-cases/mascotas/generarCodigosChapa.use-case';
import { obtenerRecuentoLoteUseCase } from '@/core/application/use-cases/mascotas/obtenerRecuentoLote.use-case';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await obtenerRecuentoLoteUseCase(getPetChapaAdminRepository(), ctx.empresaId, id);
  return handleResult(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await generarCodigosChapaUseCase(getPetChapaAdminRepository(), ctx.empresaId, id, body);
  return handleResultWithStatus(result, 201);
}
