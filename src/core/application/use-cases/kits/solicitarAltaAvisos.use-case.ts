// src/core/application/use-cases/kits/solicitarAltaAvisos.use-case.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// R-M2b.2: decide, según `reservarAlta` y `findContacto`, qué email programar
// (o ninguno) — nunca distingue la respuesta HTTP (eso lo hace la ruta,
// M2b6a): esta función siempre devuelve `ok` salvo error del repositorio o
// remitente incompleto (DD8/R-M2b.2.8, antes de tocar el repositorio).
import type { Result, AppError } from '@/core/domain/entities/types';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { AltaAvisosInput, EmailKitAvisos, Programar } from '@/core/domain/entities/kit-avisos-types';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { esSerieValida } from '@/lib/kit-caducidad/serie';
import { generarTokenGestion } from '@/lib/kit-caducidad/token-gestion';
import { TEXTO_CONSENTIMIENTO_VERSION } from '@/lib/kit-caducidad/consentimiento';
import { remitenteDe, emailConfirmacion, emailGestion } from '@/lib/kit-caducidad/emails-avisos';
import { kitAvisosEmailDentroDeLimite } from '@/core/infrastructure/api/rate-limit';

const PENDIENTE_CADUCA_HORAS = 48;

export interface SolicitarAltaAvisosCommand {
  empresaId: string;
  serie: string;
  email: string;
  telefono: string | null;
  whatsapp: boolean;
  baseUrl: string;
  titular: LegalContext['titular'];
}

function ok(): Result<void, AppError> {
  return { success: true, data: undefined };
}

function errorRemitenteIncompleto(): Result<void, AppError> {
  return {
    success: false,
    error: {
      code: 'KIT_AVISOS_REMITENTE_INCOMPLETO',
      message: 'El titular legal no tiene email o NIF configurados',
      module: 'use-case',
    },
  };
}

export async function solicitarAltaAvisosUseCase(
  repo: IKitAvisosRepository,
  email: EmailKitAvisos,
  programar: Programar,
  cmd: SolicitarAltaAvisosCommand,
): Promise<Result<void, AppError>> {
  if (!esSerieValida(cmd.serie)) return ok();

  const remitente = remitenteDe(cmd.titular);
  if (!remitente) return errorRemitenteIncompleto();

  const ahora = new Date();
  const pendienteCaducaAntesDe = new Date(ahora.getTime() - PENDIENTE_CADUCA_HORAS * 60 * 60 * 1000);
  const token = generarTokenGestion();

  const altaInput: AltaAvisosInput = {
    serie: cmd.serie,
    email: cmd.email,
    telefono: cmd.telefono,
    whatsapp: cmd.whatsapp,
    version: TEXTO_CONSENTIMIENTO_VERSION,
    token,
    ahora: ahora.toISOString(),
    pendienteCaducaAntesDe: pendienteCaducaAntesDe.toISOString(),
  };

  const reservado = await repo.reservarAlta(cmd.empresaId, altaInput);
  if (!reservado.success) return reservado;

  if (reservado.data) {
    if (!(await kitAvisosEmailDentroDeLimite(cmd.serie))) return ok();
    programar(async () => {
      const contenido = emailConfirmacion({ serie: cmd.serie, token, baseUrl: cmd.baseUrl, remitente });
      await email.enviar(cmd.email, contenido);
    });
    return ok();
  }

  const contacto = await repo.findContacto(cmd.empresaId, cmd.serie);
  if (!contacto.success) return contacto;
  if (contacto.data?.estado !== 'registrada') return ok();

  if (!(await kitAvisosEmailDentroDeLimite(cmd.serie))) return ok();
  const { email: emailActual, token: tokenActual } = contacto.data;
  programar(async () => {
    const contenido = emailGestion({ serie: cmd.serie, token: tokenActual, baseUrl: cmd.baseUrl, remitente }, 'intento');
    await email.enviar(emailActual, contenido);
  });
  return ok();
}
