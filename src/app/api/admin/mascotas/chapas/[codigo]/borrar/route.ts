// sdd pet-id-qr-profile, Fase 6 (DD12, R-QR.1.3) — además de
// `resolveMascotasAdminContext`, «Borrar datos» exige
// `requireRole(['admin','superadmin'])`: un rol administrativo más débil
// (p. ej. manager) no puede ejecutar el borrado auditado de una mascota.
import { NextRequest } from 'next/server';
import { resolveMascotasAdminContext } from '@/core/infrastructure/api/mascotas-admin-context';
import { requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getPetChapaAdminRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { borrarDatosChapaUseCase } from '@/core/application/use-cases/mascotas/borrarDatosChapa.use-case';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';

export async function POST(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const { codigo } = await params;
  const actor = resolveActor(req);
  const result = await borrarDatosChapaUseCase(
    getPetChapaAdminRepository(),
    getAuditLogRepository(),
    ctx.empresaId,
    codigo,
    actor,
  );
  return handleResult(result);
}
