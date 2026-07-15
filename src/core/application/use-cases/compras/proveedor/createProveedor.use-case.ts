import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { Proveedor } from '@/core/domain/entities/compras-types';

const schema = z.object({
  nombre: z.string().min(1).max(200),
  cif: z.string().max(20).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  telefono: z.string().max(30).optional(),
  condicionesPago: z.string().max(500).optional(),
  direccionFiscal: z.string().max(500).optional(),
  observaciones: z.string().max(1000).optional(),
});

export async function createProveedorUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<Proveedor, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }
  return repo.createProveedor(empresaId, parsed.data);
}
