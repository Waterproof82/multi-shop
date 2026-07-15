import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { AlbaranCompraItem } from '@/core/domain/entities/compras-types';

const schema = z.object({
  catalogoCompraId: z.string().uuid(),
  cantidadRecibida: z.number().positive(),
  precioCompraCents: z.number().int().min(0),
  porcentajeIva: z.union([z.literal(0), z.literal(4), z.literal(10), z.literal(21)]),
  numeroLote: z.string().max(100).optional(),
  fechaCaducidad: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function isFechaCaducidadValida(fecha: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return fecha >= today;
}

function buildTrazabilidadError(): { success: false; error: AppError } {
  return {
    success: false,
    error: {
      code: 'SANIDAD_TRAZABILIDAD_REQUERIDA',
      message: 'Ingrediente perecedero: se requiere número de lote y fecha de caducidad válida (Reg. CE 178/2002)',
      module: 'use-case',
    },
  };
}

function validateTrazabilidad(
  esPerecedero: boolean | undefined,
  numeroLote: string | undefined,
  fechaCaducidad: string | undefined,
): boolean {
  if (!esPerecedero) return true;
  if (!numeroLote || numeroLote.trim() === '') return false;
  if (!fechaCaducidad) return false;
  return isFechaCaducidadValida(fechaCaducidad);
}

export async function addItemToAlbaranUseCase(
  repo: IComprasRepository,
  empresaId: string,
  albaranId: string,
  input: unknown,
): Promise<Result<AlbaranCompraItem, AppError>> {
  const albaranResult = await repo.findAlbaranById(empresaId, albaranId);
  if (!albaranResult.success) {
    return albaranResult;
  }
  if (albaranResult.data.estado === 'recibido') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_ALBARAN_INMUTABLE',
        message: 'No se pueden añadir ítems a un albarán ya recibido',
        module: 'use-case',
      },
    };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  const { catalogoCompraId, numeroLote, fechaCaducidad } = parsed.data;

  const catalogoResult = await repo.findCatalogoItemById(empresaId, catalogoCompraId);
  if (!catalogoResult.success) {
    return {
      success: false,
      error: { code: 'COMPRAS_CATALOGO_NOT_FOUND', message: 'Ítem de catálogo no encontrado', module: 'use-case' },
    };
  }

  const { esPerecedero } = catalogoResult.data;
  if (!validateTrazabilidad(esPerecedero, numeroLote, fechaCaducidad)) {
    return buildTrazabilidadError();
  }

  return repo.addItemToAlbaran(empresaId, albaranId, parsed.data);
}
