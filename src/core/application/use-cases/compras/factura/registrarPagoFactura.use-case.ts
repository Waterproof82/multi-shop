import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { FacturaProveedor } from '@/core/domain/entities/compras-types';

const schema = z.object({
  metodoPago: z.enum(['pagado_caja', 'pagado_banco']),
  turnoId: z.string().uuid().optional(),
});

export async function registrarPagoFacturaUseCase(
  repo: IComprasRepository,
  empresaId: string,
  id: string,
  input: unknown,
): Promise<Result<FacturaProveedor, AppError>> {
  const facturaResult = await repo.findFacturaById(empresaId, id);
  if (!facturaResult.success) {
    return {
      success: false,
      error: { code: 'COMPRAS_FACTURA_NOT_FOUND', message: 'Factura no encontrada', module: 'use-case' },
    };
  }

  if (facturaResult.data.estadoPago !== 'pendiente') {
    return {
      success: false,
      error: { code: 'COMPRAS_FACTURA_YA_PAGADA', message: 'La factura ya ha sido pagada', module: 'use-case' },
    };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  if (parsed.data.metodoPago === 'pagado_caja' && !parsed.data.turnoId) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_TURNO_REQUERIDO',
        message: 'Se requiere turnoId para pagos en caja',
        module: 'use-case',
      },
    };
  }

  return repo.registrarPagoFactura(empresaId, id, parsed.data);
}
