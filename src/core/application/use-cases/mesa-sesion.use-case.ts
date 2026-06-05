import { IMesaSesionRepository, MesaSesion, DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';
import { IMesaRepository, MesaWithSession } from '@/core/domain/repositories/IMesaRepository';
import { Result } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

export class MesaSesionUseCase {
  constructor(
    private readonly mesaSesionRepo: IMesaSesionRepository,
    private readonly mesaRepo: IMesaRepository,
  ) {}

  async openSesion(mesaId: string, empresaId: string): Promise<Result<string>> {
    try {
      const result = await this.mesaSesionRepo.openSesion(mesaId, empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.openSesion' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.openSesion', { details: { mesaId, empresaId } });
      return { success: false, error: appError };
    }
  }

  async closeSesion(sesionId: string): Promise<Result<void>> {
    try {
      const result = await this.mesaSesionRepo.closeSesion(sesionId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.closeSesion' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.closeSesion', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async getSesionWithOrders(sesionId: string): Promise<Result<MesaSesion | null>> {
    try {
      const result = await this.mesaSesionRepo.findSesionWithOrders(sesionId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.getSesionWithOrders' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.getSesionWithOrders', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async getMesasWithSessions(empresaId: string): Promise<Result<MesaWithSession[]>> {
    try {
      const result = await this.mesaRepo.findAllWithSession(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.getMesasWithSessions' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.getMesasWithSessions', { empresaId });
      return { success: false, error: appError };
    }
  }

  async getDeferredItems(mesaId: string): Promise<Result<DeferredItem[]>> {
    try {
      const result = await this.mesaSesionRepo.getDeferredItems(mesaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.getDeferredItems' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.getDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void>> {
    try {
      const result = await this.mesaSesionRepo.setDeferredItems(mesaId, items);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.setDeferredItems' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.setDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }
}
