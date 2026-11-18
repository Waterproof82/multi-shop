// src/core/application/use-cases/kits/verContactoKit.use-case.ts
// kit-expiry-reminders M4d — R-M4.5.2/R-M4.5.3, DD12 de design.md: único
// caso de uso que devuelve el email/telefono completos de una fila, y que
// SIEMPRE deja constancia de quién los vio. El audit_log (mecanismo ya
// existente en multi_shop, `src/core/infrastructure/repositories/
// supabase-audit-log.repository.ts`) solo recibe `{ serie }` en el payload
// — nunca el email ni el teléfono, ni siquiera al revelarlos (R-M4.5.3).
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { ContactoKit } from '@/core/domain/entities/kit-caducidad-types';
import type { ActorTipo } from '@/core/domain/entities/audit-types';

/** Mismo shape que `ResolvedActor` de `core/infrastructure/api/audit-actor.ts`, sin importarlo (use-case no depende de infraestructura). */
export interface ActorAuditoria {
  actorId: string | null;
  actorTipo: ActorTipo;
  actorNombre: string | null;
}

export async function verContactoKitUseCase(
  repo: IKitCaducidadRepository,
  auditRepo: IAuditLogRepository,
  empresaId: string,
  serie: string,
  actor: ActorAuditoria,
): Promise<Result<ContactoKit, AppError>> {
  const result = await repo.findContacto(empresaId, serie);
  if (!result.success) return result;
  if (!result.data) {
    return { success: false, error: { code: 'KIT_SERIE_NOT_FOUND', message: 'Serie no encontrada', module: 'use-case' } };
  }

  void auditRepo.insert({
    empresaId,
    action: 'admin.kits.ver_contacto',
    payload: { serie },
    ...actor,
  });

  return { success: true, data: result.data };
}
