// src/core/application/use-cases/mascotas/solicitarAltaChapa.use-case.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 10 (DD5/R-QR.4): decide, según `reservarAlta` y `findContacto`, qué
// email programar (o ninguno) — nunca distingue la respuesta HTTP (eso lo
// hace la ruta, sin oráculo: R-QR.4.3). "Enfoque técnico" de design.md: los
// puertos `EmailKitAvisos`/`Programar` se reutilizan TAL CUAL de
// `kit-avisos-types.ts` (M2b) — este caso de uso no conoce Next, Brevo ni
// R2. Siempre devuelve `ok` salvo error del repositorio o remitente
// incompleto (DD17, antes de tocar el repositorio). Calco de
// `solicitarAltaAvisosUseCase` (M2b).
import type { Result, AppError } from '@/core/domain/entities/types';
import type { IPetPerfilRepository } from '@/core/domain/repositories/IPetPerfilRepository';
import type { AltaChapaInput } from '@/core/domain/entities/pet-chapa-types';
import type { EmailKitAvisos, Programar } from '@/core/domain/entities/kit-avisos-types';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import type { Language } from '@/lib/language-context';
import { esCodigoChapaValido } from '@/lib/pet-id/codigo';
import { generarTokenGestion } from '@/lib/kit-caducidad/token-gestion';
import { TEXTO_CONSENTIMIENTO_PERFIL_VERSION } from '@/lib/pet-id/consentimiento';
import { remitenteDe } from '@/lib/kit-caducidad/emails-avisos';
import { emailConfirmacionChapa, emailIntentoAlta } from '@/lib/pet-id/emails-chapa';
import { mascotaAltaEmailDentroDeLimite } from '@/core/infrastructure/api/rate-limit';

const PENDIENTE_CADUCA_HORAS = 48;

export interface SolicitarAltaChapaCommand {
  empresaId: string;
  codigo: string;
  email: string;
  nombre: string;
  especie: 'perro' | 'gato';
  notas: string | null;
  /** DD9: resuelto por la ruta (`idiomaDePeticion`) — este caso de uso no conoce `headers()`. */
  idioma: Language;
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
      code: 'PET_ALTA_REMITENTE_INCOMPLETO',
      message: 'El titular legal no tiene email o NIF configurados',
      module: 'use-case',
    },
  };
}

export async function solicitarAltaChapaUseCase(
  repo: IPetPerfilRepository,
  email: EmailKitAvisos,
  programar: Programar,
  cmd: SolicitarAltaChapaCommand,
): Promise<Result<void, AppError>> {
  if (!esCodigoChapaValido(cmd.codigo)) return ok();

  const remitente = remitenteDe(cmd.titular);
  if (!remitente) return errorRemitenteIncompleto();

  const ahora = new Date();
  const pendienteCaducaAntesDe = new Date(ahora.getTime() - PENDIENTE_CADUCA_HORAS * 60 * 60 * 1000);
  const token = generarTokenGestion();

  const altaInput: AltaChapaInput = {
    codigo: cmd.codigo,
    email: cmd.email,
    nombre: cmd.nombre,
    especie: cmd.especie,
    notas: cmd.notas,
    idioma: cmd.idioma,
    version: TEXTO_CONSENTIMIENTO_PERFIL_VERSION,
    token,
    ahora: ahora.toISOString(),
    pendienteCaducaAntesDe: pendienteCaducaAntesDe.toISOString(),
  };

  const reservado = await repo.reservarAlta(cmd.empresaId, altaInput);
  if (!reservado.success) return reservado;

  if (reservado.data) {
    if (!(await mascotaAltaEmailDentroDeLimite(cmd.codigo))) return ok();
    programar(async () => {
      const contenido = emailConfirmacionChapa({
        nombre: cmd.nombre,
        codigo: cmd.codigo,
        token,
        baseUrl: cmd.baseUrl,
        remitente,
        idioma: cmd.idioma,
      });
      await email.enviar(cmd.email, contenido, { remitenteEmail: remitente.email });
    });
    return ok();
  }

  // R-QR.4.4: 0 filas — la chapa YA tenía email (activa, o un pendiente
  // AÚN vigente de otro alta). Solo se avisa al dueño si está ACTIVA; un
  // pendiente vigente de otro alta no produce ningún email observable
  // (evita que un tercero confirme, con el "intento", que esa chapa ya
  // tiene un alta en curso).
  const contacto = await repo.findContacto(cmd.empresaId, cmd.codigo);
  if (!contacto.success) return contacto;
  if (contacto.data?.estado !== 'activa') return ok();

  if (!(await mascotaAltaEmailDentroDeLimite(cmd.codigo))) return ok();
  const { email: emailActual, token: tokenActual, nombre: nombreActual, idioma: idiomaActual } = contacto.data;
  programar(async () => {
    const contenido = emailIntentoAlta({
      nombre: nombreActual,
      codigo: cmd.codigo,
      token: tokenActual,
      baseUrl: cmd.baseUrl,
      remitente,
      idioma: idiomaActual,
    });
    await email.enviar(emailActual, contenido, { remitenteEmail: remitente.email });
  });
  return ok();
}
