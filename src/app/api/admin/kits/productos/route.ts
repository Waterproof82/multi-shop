import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';

/** Listado para el selector de producto del alta de lote (sin paginar: ya filtra por kit). */
export async function GET(req: NextRequest) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const result = await getKitCaducidadRepository().findProductosKit(ctx.empresaId);
  return handleResult(result);
}
