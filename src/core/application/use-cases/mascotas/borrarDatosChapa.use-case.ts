// src/core/application/use-cases/mascotas/borrarDatosChapa.use-case.ts
// sdd pet-id-qr-profile, Fase 6 — R-QR.1.3: único caso de uso que ejecuta el
// borrado auditado de una chapa. El audit_log (mecanismo ya existente en
// multi_shop) solo recibe `{ codigo }` en el payload — nunca el email, el
// teléfono, el nombre de la mascota, el token ni la foto, ni siquiera al
// borrarlos (calco de `verContactoKit.use-case.ts`).
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { ActorTipo } from '@/core/domain/entities/audit-types';

/** Mismo shape que `ResolvedActor` de `core/infrastructure/api/audit-actor.ts`, sin importarlo (use-case no depende de infraestructura). */
export interface ActorAuditoria {
  actorId: string | null;
  actorTipo: ActorTipo;
  actorNombre: string | null;
}

export async function borrarDatosChapaUseCase(
  repo: IPetChapaAdminRepository,
  auditRepo: IAuditLogRepository,
  empresaId: string,
  codigo: string,
  actor: ActorAuditoria,
): Promise<Result<{ codigo: string }, AppError>> {
  const result = await repo.borrarDatos(empresaId, codigo);
  if (!result.success) return result;
  if (!result.data) {
    return {
      success: false,
      error: { code: 'PET_CHAPA_NOT_FOUND', message: 'Chapa no encontrada o ya libre', module: 'use-case' },
    };
  }

  void auditRepo.insert({
    empresaId,
    action: 'admin.mascotas.borrar_datos',
    payload: { codigo },
    ...actor,
  });

  return { success: true, data: result.data };
}
