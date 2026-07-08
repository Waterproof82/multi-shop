import { hashPin } from '@/lib/waiter-auth';
import type { IEmpleadoTpvRepository } from '@/core/domain/repositories/IEmpleadoTpvRepository';
import type { TpvEmployeeTokenPayload } from '@/lib/tpv-employee-auth';
import type { Result } from '@/core/domain/entities/types';

export class EmpleadoTpvLoginUseCase {
  constructor(private readonly repo: IEmpleadoTpvRepository) {}

  async execute(pin: string, empresaId: string): Promise<Result<TpvEmployeeTokenPayload>> {
    const pinHash = await hashPin(pin, empresaId);
    const result = await this.repo.findActiveByPinHash(empresaId, pinHash);

    if (!result.success) return result;
    if (!result.data) {
      return {
        success: false,
        error: { code: 'INVALID_PIN', message: 'PIN incorrecto', module: 'use-case', method: 'EmpleadoTpvLoginUseCase' },
      };
    }

    const e = result.data;
    return {
      success: true,
      data: { empleadoId: e.id, empresaId: e.empresaId, nombre: e.nombre, rol: e.rol },
    };
  }
}
