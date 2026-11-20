// src/core/application/use-cases/mascotas/generarEtiquetasLote.use-case.ts
// sdd pet-id-qr-profile, Fase 8 — calco de
// `generarEtiquetasLote.use-case.ts` de kit-caducidad (M5): el caso de uso
// NO conoce React ni `qrcode` — solo devuelve los datos de la hoja
// (`EtiquetasLotePet`). El renderer (infraestructura) es el único que
// dibuja el PDF.
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { EtiquetaChapa, EtiquetasLotePet } from '@/core/domain/entities/pet-chapa-types';
import { etiquetasChapaQuerySchema } from '@/core/application/dtos/pet-chapa.dto';
import { urlPerfilChapa } from '@/lib/pet-id/urls';
import { POR_PDF } from '@/lib/pet-id/chapa-layout';
import { PET_PERFIL_PUBLICO_LIVE } from '@/lib/pet-id/publico';

export interface GenerarEtiquetasLoteChapaOpciones {
  /** DD5 de M5, reutilizado aquí: inyectable en tests; por defecto `PET_PERFIL_PUBLICO_LIVE`. */
  perfilPublicoLive?: boolean;
}

function validationError(message: string): Result<EtiquetasLotePet, AppError> {
  return { success: false, error: { code: 'VALIDATION_ERROR', message, module: 'use-case' } };
}

/**
 * R-QR.14.1/R-QR.14.2/R-QR.14.4: construye los datos de UNA página del PDF
 * de etiquetas de un lote.
 *   - El lote debe ser de la propia empresa.
 *   - Trocea `findCodigosDeLote` (ya ordenado de forma estable) en bloques
 *     de `POR_PDF`; `pagina` fuera de rango → `VALIDATION_ERROR`.
 *   - Si un código no supera `esCodigoChapaValido` (vía `urlPerfilChapa`),
 *     falla TODO el PDF con `PET_CODIGO_INVALIDO` — no se genera ninguna
 *     etiqueta.
 *   - R-QR.14.2: el resultado solo lleva `codigo` y su URL del perfil —
 *     nunca teléfono ni ningún otro dato de contacto de `pet_chapas`.
 */
export async function generarEtiquetasLoteUseCase(
  repo: IPetChapaAdminRepository,
  empresaId: string,
  loteId: string,
  query: unknown,
  opciones: GenerarEtiquetasLoteChapaOpciones = {},
): Promise<Result<EtiquetasLotePet, AppError>> {
  const parsed = etiquetasChapaQuerySchema.safeParse(query);
  if (!parsed.success) return validationError(parsed.error.message);

  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  const codigosResult = await repo.findCodigosDeLote(empresaId, loteId);
  if (!codigosResult.success) return codigosResult;
  if (codigosResult.data.length === 0) return validationError('El lote no tiene chapas');

  const totalPaginas = Math.ceil(codigosResult.data.length / POR_PDF);
  const { pagina } = parsed.data;
  if (pagina > totalPaginas) {
    return validationError(`La página ${pagina} no existe: el lote tiene ${totalPaginas}`);
  }

  const desde = (pagina - 1) * POR_PDF;
  const codigosPagina = codigosResult.data.slice(desde, desde + POR_PDF);

  const etiquetas: EtiquetaChapa[] = [];
  for (const codigo of codigosPagina) {
    const url = urlPerfilChapa(codigo);
    if (url === null) {
      return {
        success: false,
        error: { code: 'PET_CODIGO_INVALIDO', message: `Código inválido en el lote: ${codigo.slice(0, 8)}…`, module: 'use-case' },
      };
    }
    etiquetas.push({ codigo, url });
  }

  const perfilPublicoLive = opciones.perfilPublicoLive ?? PET_PERFIL_PUBLICO_LIVE;

  return {
    success: true,
    data: {
      codigoLote: loteResult.data.codigo,
      etiquetas,
      muestra: !perfilPublicoLive,
      pagina,
      totalPaginas,
    },
  };
}
