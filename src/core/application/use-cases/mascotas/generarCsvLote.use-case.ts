// src/core/application/use-cases/mascotas/generarCsvLote.use-case.ts
// sdd pet-id-qr-profile, Fase 8 (R-QR.14.3) — a diferencia del PDF
// (`generarEtiquetasLote.use-case.ts`), el CSV no se pagina: el proveedor de
// impresión con datos variables necesita el lote completo en un solo
// fichero. El caso de uso solo devuelve datos (`CsvLotePet`) — construir el
// texto CSV (y su defensa contra inyección de fórmula) es responsabilidad
// de `lib/pet-id/csv.ts`, igual que el renderer PDF es quien dibuja.
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { EtiquetaChapa, CsvLotePet } from '@/core/domain/entities/pet-chapa-types';
import { urlPerfilChapa } from '@/lib/pet-id/urls';

/** R-QR.14.3: todos los códigos del lote con su URL de perfil, nunca ningún dato de contacto (R-QR.14.2). */
export async function generarCsvLoteUseCase(
  repo: IPetChapaAdminRepository,
  empresaId: string,
  loteId: string,
): Promise<Result<CsvLotePet, AppError>> {
  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  const codigosResult = await repo.findCodigosDeLote(empresaId, loteId);
  if (!codigosResult.success) return codigosResult;
  if (codigosResult.data.length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'El lote no tiene chapas', module: 'use-case' } };
  }

  const etiquetas: EtiquetaChapa[] = [];
  for (const codigo of codigosResult.data) {
    const url = urlPerfilChapa(codigo);
    if (url === null) {
      return {
        success: false,
        error: { code: 'PET_CODIGO_INVALIDO', message: `Código inválido en el lote: ${codigo.slice(0, 8)}…`, module: 'use-case' },
      };
    }
    etiquetas.push({ codigo, url });
  }

  return { success: true, data: { codigoLote: loteResult.data.codigo, etiquetas } };
}
