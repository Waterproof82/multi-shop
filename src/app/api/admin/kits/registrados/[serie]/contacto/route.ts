import { NextRequest } from 'next/server';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { verContactoKitUseCase } from '@/core/application/use-cases/kits/verContactoKit.use-case';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';

// R-M4.5.2/R-M4.5.3: única vía para revelar el email/telefono completos de
// una fila. `Cache-Control: no-store` (nunca cacheado, ni por el navegador
// ni por un proxy intermedio) y auditoría obligatoria del acceso — el
// audit_log solo guarda la serie, nunca el email ni el teléfono.
export async function GET(req: NextRequest, { params }: { params: Promise<{ serie: string }> }) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const { serie } = await params;
  const actor = resolveActor(req);
  const result = await verContactoKitUseCase(getKitCaducidadRepository(), getAuditLogRepository(), ctx.empresaId, serie, actor);

  const response = handleResult(result);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
