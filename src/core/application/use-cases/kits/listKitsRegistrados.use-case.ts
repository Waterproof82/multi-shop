// src/core/application/use-cases/kits/listKitsRegistrados.use-case.ts
// kit-expiry-reminders M4d — R-M4.5.1/R-M4.5.4: paginación real (sin tope de
// 1000 filas), solo los registros de la propia empresa (o la indicada por
// `?empresaId=` si quien pide es superadmin, resuelto antes de llegar aquí
// por `resolveKitsAdminContext`). El email/telefono ya llegan enmascarados
// desde `repo.findRegistrados` (DD12) — este caso de uso no los toca.
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { KitRegistradoListado, Paginado } from '@/core/domain/entities/kit-caducidad-types';
import { paginaSchema } from '@/core/application/dtos/kit-caducidad.dto';

export async function listKitsRegistradosUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<Paginado<KitRegistradoListado>, AppError>> {
  const parsed = paginaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  return repo.findRegistrados(empresaId, parsed.data);
}
