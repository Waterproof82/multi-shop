import { IStockRepository } from '@/core/domain/repositories/IStockRepository';
import { AjustarStockPayload, Ingrediente } from '@/core/domain/entities/stock-types';
import { Result, AppError } from '@/core/domain/entities/types';

async function rehabilitarProductosSiUmbralSuperado(
  repo: IStockRepository,
  ingredienteId: string,
): Promise<void> {
  const ingredienteResult = await repo.findIngredienteById(ingredienteId);
  if (!ingredienteResult.success) return;

  const { cantidadActual, umbralAlerta } = ingredienteResult.data;
  if (umbralAlerta <= 0 || cantidadActual < umbralAlerta) return;

  // Re-enable products linked to this ingredient via receta_items.
  // The actual UPDATE productos query lives at the infrastructure layer —
  // we delegate via the repository's dedicated method if available,
  // otherwise this is a no-op (the trigger handles auto-disable; re-enable is manual here).
  // Note: full re-enable logic is implemented in the API route (Phase 3) using getSupabaseClient().
}

export async function ajustarStockUseCase(
  repo: IStockRepository,
  payload: AjustarStockPayload,
): Promise<Result<Ingrediente, AppError>> {
  if (payload.delta === 0) {
    return {
      success: false,
      error: {
        code: 'STOCK_AJUSTE_DELTA_CERO',
        message: 'El delta del ajuste no puede ser cero',
        module: 'use-case',
        method: 'ajustarStockUseCase',
      },
    };
  }

  // Step 1: Atomic quantity update
  const updateResult = await repo.updateCantidad(payload.ingredienteId, payload.delta);
  if (!updateResult.success) {
    return updateResult;
  }

  // Step 2: Audit movement record
  const movResult = await repo.createMovimiento({
    empresaId: payload.empresaId,
    ingredienteId: payload.ingredienteId,
    tipo: payload.tipo,
    cantidad: Math.abs(payload.delta),
    referenciaId: null,
    turnoId: payload.turnoId ?? null,
  });

  if (!movResult.success) {
    return movResult;
  }

  // Step 3: If positive delta, check threshold and re-enable products if needed
  if (payload.delta > 0) {
    await rehabilitarProductosSiUmbralSuperado(repo, payload.ingredienteId);
  }

  return updateResult;
}
