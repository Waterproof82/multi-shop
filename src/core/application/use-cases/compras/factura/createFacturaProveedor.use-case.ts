import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { FacturaProveedor } from '@/core/domain/entities/compras-types';

const schema = z.object({
  proveedorId: z.string().uuid(),
  numeroFactura: z.string().min(1).max(100),
  fechaFactura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseImponible0Cents: z.number().int().min(0),
  baseImponible3Cents: z.number().int().min(0).optional(),
  baseImponible4Cents: z.number().int().min(0),
  baseImponible7Cents: z.number().int().min(0).optional(),
  baseImponible10Cents: z.number().int().min(0),
  baseImponible15Cents: z.number().int().min(0).optional(),
  baseImponible21Cents: z.number().int().min(0),
  baseImponible95Cents: z.number().int().min(0).optional(),
  ivaSoportadoCents: z.number().int().min(0),
  totalFacturaCents: z.number().int().min(0),
  notas: z.string().max(1000).optional(),
  albaranIds: z.array(z.string().uuid()).min(1),
});

function validateIvaMath(dto: z.infer<typeof schema>, ivaSoportado: number): boolean {
  const expectedIva = Math.round(
    (dto.baseImponible3Cents ?? 0) * 0.03 +
    (dto.baseImponible4Cents ?? 0) * 0.04 +
    (dto.baseImponible7Cents ?? 0) * 0.07 +
    (dto.baseImponible95Cents ?? 0) * 0.095 +
    (dto.baseImponible10Cents ?? 0) * 0.10 +
    (dto.baseImponible15Cents ?? 0) * 0.15 +
    (dto.baseImponible21Cents ?? 0) * 0.21,
  );
  return Math.abs(ivaSoportado - expectedIva) <= 2;
}

function validateTotalMath(dto: z.infer<typeof schema>, ivaSoportado: number, total: number): boolean {
  const allBases =
    dto.baseImponible0Cents +
    (dto.baseImponible3Cents ?? 0) +
    dto.baseImponible4Cents +
    (dto.baseImponible7Cents ?? 0) +
    dto.baseImponible10Cents +
    (dto.baseImponible15Cents ?? 0) +
    dto.baseImponible21Cents +
    (dto.baseImponible95Cents ?? 0);
  const expectedTotal = allBases + ivaSoportado;
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

  const { ivaSoportadoCents, totalFacturaCents } = parsed.data;

  if (!validateIvaMath(parsed.data, ivaSoportadoCents)) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_IVA_INVALIDO',
        message: 'El IVA/IGIC soportado no coincide con las bases imponibles (tolerancia ±2 cents)',
        module: 'use-case',
      },
    };
  }

  if (!validateTotalMath(parsed.data, ivaSoportadoCents, totalFacturaCents)) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_TOTAL_INVALIDO',
        message: 'El total no coincide con la suma de bases + IVA/IGIC (tolerancia ±2 cents)',
        module: 'use-case',
      },
    };
  }

  return repo.createFactura(empresaId, parsed.data);
}
