import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { FacturaProveedor } from '@/core/domain/entities/compras-types';

const schema = z.object({
  proveedorId: z.string().uuid(),
  numeroFactura: z.string().min(1).max(100),
  fechaFactura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseImponible0Cents: z.number().int().min(0),
  baseImponible4Cents: z.number().int().min(0),
  baseImponible10Cents: z.number().int().min(0),
  baseImponible21Cents: z.number().int().min(0),
  ivaSoportadoCents: z.number().int().min(0),
  totalFacturaCents: z.number().int().min(0),
  notas: z.string().max(1000).optional(),
  albaranIds: z.array(z.string().uuid()).min(1),
});

function validateIvaMath(
  base4: number,
  base10: number,
  base21: number,
  ivaSoportado: number,
): boolean {
  const expectedIva = Math.round(base4 * 0.04 + base10 * 0.10 + base21 * 0.21);
  return Math.abs(ivaSoportado - expectedIva) <= 2;
}

function validateTotalMath(
  base0: number,
  base4: number,
  base10: number,
  base21: number,
  ivaSoportado: number,
  total: number,
): boolean {
  const expectedTotal = base0 + base4 + base10 + base21 + ivaSoportado;
  return Math.abs(total - expectedTotal) <= 2;
}

export async function createFacturaProveedorUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<FacturaProveedor, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  const {
    baseImponible0Cents: base0,
    baseImponible4Cents: base4,
    baseImponible10Cents: base10,
    baseImponible21Cents: base21,
    ivaSoportadoCents,
    totalFacturaCents,
  } = parsed.data;

  if (!validateIvaMath(base4, base10, base21, ivaSoportadoCents)) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_IVA_INVALIDO',
        message: 'El IVA soportado no coincide con las bases imponibles (tolerancia ±2 cents)',
        module: 'use-case',
      },
    };
  }

  if (!validateTotalMath(base0, base4, base10, base21, ivaSoportadoCents, totalFacturaCents)) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_TOTAL_INVALIDO',
        message: 'El total no coincide con la suma de bases + IVA (tolerancia ±2 cents)',
        module: 'use-case',
      },
    };
  }

  return repo.createFactura(empresaId, parsed.data);
}
