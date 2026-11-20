// src/core/application/use-cases/mascotas/generarCodigosChapa.use-case.ts
// sdd pet-id-qr-profile, Fase 5 — calco de `generarSeriesLote.use-case.ts`
// (kit-expiry-m4c, DD10): inserta `cantidad` códigos nuevos con `ON CONFLICT
// DO NOTHING RETURNING` (`repo.insertCodigosIgnorandoDuplicados`). Si una
// colisión descarta alguna fila, se repone generando códigos nuevos hasta
// `INTENTOS_MAXIMOS`; si aun así faltan, `CONFLICT` con cuántos se generaron
// de cuántos se pidieron, sin dejar filas duplicadas.
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import { generarCodigosChapaSchema } from '@/core/application/dtos/pet-chapa.dto';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';

const INTENTOS_MAXIMOS = 5;

export async function generarCodigosChapaUseCase(
  repo: IPetChapaAdminRepository,
  empresaId: string,
  loteId: string,
  input: unknown,
  generador: () => string = generarCodigoChapa,
): Promise<Result<string[], AppError>> {
  const parsed = generarCodigosChapaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  const { cantidad } = parsed.data;
  const creados: string[] = [];

  for (let intento = 0; intento < INTENTOS_MAXIMOS && creados.length < cantidad; intento++) {
    const faltan = cantidad - creados.length;
    const candidatos = Array.from({ length: faltan }, () => generador());
    const result = await repo.insertCodigosIgnorandoDuplicados(empresaId, loteId, candidatos);
    if (!result.success) return result;
    creados.push(...result.data);
  }

  if (creados.length < cantidad) {
    return {
      success: false,
      error: { code: 'CONFLICT', message: `Se generaron ${creados.length} de ${cantidad} códigos`, module: 'use-case' },
    };
  }

  return { success: true, data: creados };
}
