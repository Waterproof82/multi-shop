// src/core/application/use-cases/kits/solicitarEnlaceGestion.use-case.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// R-M2b.4: solo programa el email de gestión "solicitud" cuando el email
// recibido coincide (sin distinguir mayúsculas) con el contacto actual de
// la serie — nunca distingue la respuesta HTTP (siempre 202, R-M2b.4.2),
// y respeta el mismo tope de 3 emails/24h por serie (M2b2) y el mismo
// remitente identificable que el alta (sin romper el "siempre 202": sin
// remitente, simplemente no se programa nada).
import type { Result, AppError } from '@/core/domain/entities/types';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { EmailKitAvisos, Programar } from '@/core/domain/entities/kit-avisos-types';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { remitenteDe, emailGestion } from '@/lib/kit-caducidad/emails-avisos';
import { kitAvisosEmailDentroDeLimite } from '@/core/infrastructure/api/rate-limit';

export interface SolicitarEnlaceGestionCommand {
  empresaId: string;
  serie: string;
  email: string;
  baseUrl: string;
  titular: LegalContext['titular'];
}

function ok(): Result<void, AppError> {
  return { success: true, data: undefined };
}

export async function solicitarEnlaceGestionUseCase(
  repo: IKitAvisosRepository,
  email: EmailKitAvisos,
  programar: Programar,
  cmd: SolicitarEnlaceGestionCommand,
): Promise<Result<void, AppError>> {
  const contacto = await repo.findContacto(cmd.empresaId, cmd.serie);
  if (!contacto.success) return contacto;
  if (!contacto.data) return ok();
  if (contacto.data.email.toLowerCase() !== cmd.email.toLowerCase()) return ok();

  const remitente = remitenteDe(cmd.titular);
  if (!remitente) return ok();

  if (!(await kitAvisosEmailDentroDeLimite(cmd.serie))) return ok();

  const { email: emailActual, token } = contacto.data;
  programar(async () => {
    const contenido = emailGestion({ serie: cmd.serie, token, baseUrl: cmd.baseUrl, remitente }, 'solicitud');
    await email.enviar(emailActual, contenido);
  });
  return ok();
}
