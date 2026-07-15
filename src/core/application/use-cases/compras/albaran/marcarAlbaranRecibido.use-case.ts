import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { AlbaranCompra, AlbaranCompraItem } from '@/core/domain/entities/compras-types';

function isFechaCaducidadValida(fecha: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return fecha >= today;
}

function hasValidTrazabilidad(item: AlbaranCompraItem): boolean {
  if (item.esPerecedero !== true) return true;
  if (!item.numeroLote || item.numeroLote.trim() === '') return false;
  if (!item.fechaCaducidad) return false;
  return isFechaCaducidadValida(item.fechaCaducidad);
}

export async function marcarAlbaranRecibidoUseCase(
  repo: IComprasRepository,
  empresaId: string,
  albaranId: string,
  empleadoId: string,
): Promise<Result<AlbaranCompra, AppError>> {
  const albaranResult = await repo.findAlbaranById(empresaId, albaranId);
  if (!albaranResult.success) {
    return albaranResult;
  }

  const albaran = albaranResult.data;

  if (albaran.estado === 'recibido') {
    return {
      success: false,
      error: { code: 'COMPRAS_ALBARAN_YA_RECIBIDO', message: 'El albarán ya fue recibido', module: 'use-case' },
    };
  }

  const items = albaran.items ?? [];
  if (items.length === 0) {
    return {
      success: false,
      error: { code: 'COMPRAS_ALBARAN_SIN_ITEMS', message: 'El albarán debe tener al menos un ítem', module: 'use-case' },
    };
  }

  const tienePerecederoInvalido = items.some((item) => !hasValidTrazabilidad(item));
  if (tienePerecederoInvalido) {
    return {
      success: false,
      error: {
        code: 'SANIDAD_TRAZABILIDAD_REQUERIDA',
        message: 'Existen ítems perecederos sin número de lote o fecha de caducidad (Reg. CE 178/2002)',
        module: 'use-case',
      },
    };
  }

  return repo.marcarAlbaranRecibido(empresaId, albaranId, empleadoId);
}
