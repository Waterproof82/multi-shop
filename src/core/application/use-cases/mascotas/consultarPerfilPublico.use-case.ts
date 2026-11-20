// src/core/application/use-cases/mascotas/consultarPerfilPublico.use-case.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 9: normaliza y valida el código de la URL, y lee el perfil activo.
// Calco de `consultarEstadoKitPublicoUseCase` (M2a): un código con forma
// inválida y uno válido pero desconocido/libre/pendiente dan LO MISMO
// (`ok(null)`) — el cargador no distingue entre los dos (R-QR.3.2).
import type { IPetPerfilRepository } from '@/core/domain/repositories/IPetPerfilRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';
import { normalizarCodigoChapa, esCodigoChapaValido } from '@/lib/pet-id/codigo';

// DD5 de design.md (M2a), reaplicado: el caso de uso declara solo lo que usa.
export type PerfilPublicoRepo = Pick<IPetPerfilRepository, 'findPerfilActivo'>;

const SIN_RESULTADO: Result<PerfilPublico | null, AppError> = { success: true, data: null };

export async function consultarPerfilPublicoUseCase(
  repo: PerfilPublicoRepo,
  empresaId: string,
  codigoCrudo: string,
): Promise<Result<PerfilPublico | null, AppError>> {
  const codigo = normalizarCodigoChapa(codigoCrudo);
  if (!codigo || !esCodigoChapaValido(codigo)) return SIN_RESULTADO;

  return repo.findPerfilActivo(empresaId, codigo);
}
