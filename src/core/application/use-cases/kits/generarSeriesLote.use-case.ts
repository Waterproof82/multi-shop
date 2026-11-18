// src/core/application/use-cases/kits/generarSeriesLote.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import { generarSeriesSchema } from '@/core/application/dtos/kit-caducidad.dto';
import { generarSerie } from '@/lib/kit-caducidad/serie';

const INTENTOS_MAXIMOS = 5;

/**
 * DD10/R-M4.4: inserta `cantidad` series nuevas para un lote con
 * `ON CONFLICT DO NOTHING RETURNING` (`repo.insertSeriesIgnorandoDuplicados`,
 * que deja `pedido_id` en NULL). Si una colisión descarta alguna fila, se
 * repone generando series nuevas hasta `INTENTOS_MAXIMOS` intentos; si aun
 * así faltan, `CONFLICT` con cuántas se generaron de cuántas se pidieron
 * (R-M4.4.3), sin dejar filas duplicadas.
 */
export async function generarSeriesLoteUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  loteId: string,
  input: unknown,
  generador: () => string = generarSerie,
): Promise<Result<string[], AppError>> {
  const parsed = generarSeriesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'KIT_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  const { cantidad } = parsed.data;
  const creadas: string[] = [];

  for (let intento = 0; intento < INTENTOS_MAXIMOS && creadas.length < cantidad; intento++) {
    const faltan = cantidad - creadas.length;
    const candidatas = Array.from({ length: faltan }, () => generador());
    const result = await repo.insertSeriesIgnorandoDuplicados(empresaId, loteId, candidatas);
    if (!result.success) return result;
    creadas.push(...result.data);
  }

  if (creadas.length < cantidad) {
    return {
      success: false,
      error: {
        code: 'CONFLICT',
        message: `Se generaron ${creadas.length} de ${cantidad} series`,
        module: 'use-case',
      },
    };
  }

  return { success: true, data: creadas };
}
