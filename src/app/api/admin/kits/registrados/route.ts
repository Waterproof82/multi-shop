import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';
import { listKitsRegistradosUseCase } from '@/core/application/use-cases/kits/listKitsRegistrados.use-case';

// R-M4.5: listado paginado de kits registrados, email/telefono enmascarados
// por el repositorio (DD12). resolveKitsAdminContext ya resuelve la empresa
// objetivo (propia o la de ?empresaId= si es superadmin, R-M4.1.5/R-M4.5.4).
export async function GET(req: NextRequest) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const q = new URL(req.url).searchParams;
  const result = await listKitsRegistradosUseCase(getKitCaducidadRepository(), ctx.empresaId, {
    page: q.get('page') ?? undefined,
    pageSize: q.get('pageSize') ?? undefined,
  });
  return handleResult(result);
}
