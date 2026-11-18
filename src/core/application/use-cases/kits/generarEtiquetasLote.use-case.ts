// src/core/application/use-cases/kits/generarEtiquetasLote.use-case.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// DD1: el caso de uso NO conoce React ni `qrcode` — solo devuelve los datos
// de la hoja (`EtiquetasLote`). El renderer (infraestructura, M5b) es el
// único que dibuja el PDF.
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { EtiquetaKit, EtiquetasLote } from '@/core/domain/entities/kit-caducidad-types';
import { etiquetasQuerySchema } from '@/core/application/dtos/kit-caducidad.dto';
import { urlEstadoKit, URL_LISTA_MOCHILA } from '@/lib/kit-caducidad/etiqueta-urls';
import { POR_PDF } from '@/lib/kit-caducidad/etiqueta-layout';
import { KIT_ESTADO_PUBLICO_LIVE } from '@/lib/kit-caducidad/publico';

export interface GenerarEtiquetasLoteOpciones {
  /** DD5: inyectable en tests; por defecto `KIT_ESTADO_PUBLICO_LIVE`. */
  estadoPublicoLive?: boolean;
}

function validationError(message: string): Result<EtiquetasLote, AppError> {
  return { success: false, error: { code: 'VALIDATION_ERROR', message, module: 'use-case' } };
}

/**
 * R-M5.1/R-M5.2/R-M5.4: construye los datos de UNA página del PDF de
 * etiquetas de un lote.
 *   - El lote debe ser de la propia empresa (R-M5.1.2).
 *   - DD7: trocea `findSeriesDeLote` (ya ordenado de forma estable) en
 *     bloques de `POR_PDF`; `pagina` fuera de rango → `VALIDATION_ERROR`.
 *   - DD6: si una serie no supera `esSerieValida`, falla TODO el PDF con
 *     `KIT_SERIE_INVALIDA` — no se genera ninguna etiqueta. El mensaje solo
 *     lleva la serie truncada (nunca el valor completo en el log).
 *   - R-M5.2.4: el resultado solo lleva `serie` y su URL — nunca email ni
 *     teléfono de `kits_registrados`.
 */
export async function generarEtiquetasLoteUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  loteId: string,
  query: unknown,
  opciones: GenerarEtiquetasLoteOpciones = {},
): Promise<Result<EtiquetasLote, AppError>> {
  const parsed = etiquetasQuerySchema.safeParse(query);
  if (!parsed.success) return validationError(parsed.error.message);

  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'KIT_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  const seriesResult = await repo.findSeriesDeLote(empresaId, loteId);
  if (!seriesResult.success) return seriesResult;
  if (seriesResult.data.length === 0) return validationError('El lote no tiene series');

  const totalPaginas = Math.ceil(seriesResult.data.length / POR_PDF);
  const { pagina } = parsed.data;
  if (pagina > totalPaginas) {
    return validationError(`La página ${pagina} no existe: el lote tiene ${totalPaginas}`);
  }

  const desde = (pagina - 1) * POR_PDF;
  const seriesPagina = seriesResult.data.slice(desde, desde + POR_PDF);

  const etiquetas: EtiquetaKit[] = [];
  for (const { serie } of seriesPagina) {
    const urlEstado = urlEstadoKit(serie);
    if (urlEstado === null) {
      return {
        success: false,
        error: { code: 'KIT_SERIE_INVALIDA', message: `Serie inválida en el lote: ${serie.slice(0, 8)}…`, module: 'use-case' },
      };
    }
    etiquetas.push({ serie, urlEstado });
  }

  const estadoPublicoLive = opciones.estadoPublicoLive ?? KIT_ESTADO_PUBLICO_LIVE;

  return {
    success: true,
    data: {
      codigoLote: loteResult.data.codigo,
      etiquetas,
      urlLista: URL_LISTA_MOCHILA,
      muestra: !estadoPublicoLive,
      pagina,
      totalPaginas,
    },
  };
}
