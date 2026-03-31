import { ITgtgRepository } from '@/core/domain/repositories/ITgtgRepository';
import { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import { TgtgPromocion, TgtgItem, TgtgReserva, Result } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

export interface CreateTgtgResult {
  promo: TgtgPromocion;
  emailTargets: Array<{ email: string; nombre: string | null }>;
}

export interface TgtgWithItems {
  promo: TgtgPromocion;
  items: TgtgItem[];
}

export class TgtgUseCase {
  constructor(
    private readonly tgtgRepo: ITgtgRepository,
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async getWithItems(empresaId: string): Promise<Result<TgtgWithItems | null>> {
    try {
      const promoResult = await this.tgtgRepo.findLatestByTenant(empresaId);
      if (!promoResult.success) return promoResult;
      if (!promoResult.data) return { success: true, data: null };

      const itemsResult = await this.tgtgRepo.findItemsByPromo(promoResult.data.id);
      if (!itemsResult.success) return itemsResult;

      return {
        success: true,
        data: { promo: promoResult.data, items: itemsResult.data },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.getWithItems', { empresaId }) };
    }
  }

  async create(
    empresaId: string,
    horaRecogidaInicio: string,
    horaRecogidaFin: string,
    fechaActivacion: string,
    items: Array<{
      titulo: string;
      descripcion?: string | null;
      imagenUrl?: string | null;
      precioOriginal: number;
      precioDescuento: number;
      cuponesTotal: number;
      orden: number;
    }>,
  ): Promise<Result<CreateTgtgResult>> {
    try {
      const clientesResult = await this.clienteRepo.findAllByTenant(empresaId);

      if (!clientesResult.success) return { success: false, error: clientesResult.error };

      const emailTargets = clientesResult.data
        .filter((c) => c.aceptar_promociones && c.email)
        .map((c) => ({ email: c.email as string, nombre: c.nombre }));

      const deleteResult = await this.tgtgRepo.deleteAllByTenant(empresaId);
      if (!deleteResult.success) return { success: false, error: deleteResult.error };

      const createResult = await this.tgtgRepo.create({
        empresaId,
        horaRecogidaInicio,
        horaRecogidaFin,
        fechaActivacion,
        numeroEnvios: emailTargets.length,
        items,
      });

      if (!createResult.success) return { success: false, error: createResult.error };

      return { success: true, data: { promo: createResult.data, emailTargets } };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.create', { empresaId }) };
    }
  }

  async getReservas(
    empresaId: string,
    tgtgPromoId: string,
  ): Promise<Result<TgtgReserva[]>> {
    try {
      return await this.tgtgRepo.findReservasByPromo(tgtgPromoId, empresaId);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.getReservas', { empresaId, details: { tgtgPromoId } }) };
    }
  }

  async adjustCupones(
    empresaId: string,
    itemId: string,
    delta: number,
  ): Promise<Result<TgtgItem>> {
    try {
      const itemResult = await this.tgtgRepo.findItemById(itemId);
      if (!itemResult.success) return itemResult;
      if (!itemResult.data || itemResult.data.empresaId !== empresaId) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Item no encontrado', module: 'use-case' } };
      }

      return await this.tgtgRepo.adjustCupones(itemId, delta);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.adjustCupones', { empresaId, details: { itemId, delta } }) };
    }
  }

  async claimCupon(params: {
    itemId: string;
    email: string;
    tgtgPromoId: string;
    token: string;
  }): Promise<Result<'ok' | 'no_cupones' | 'token_used'>> {
    try {
      const itemResult = await this.tgtgRepo.findItemById(params.itemId);
      if (!itemResult.success) return itemResult;
      if (!itemResult.data) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Oferta no encontrada', module: 'use-case' } };
      }

      const promoResult = await this.tgtgRepo.findPromoById(params.tgtgPromoId);
      if (!promoResult.success) return promoResult;
      if (!promoResult.data || promoResult.data.empresaId !== itemResult.data.empresaId) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Promoción no encontrada', module: 'use-case' } };
      }

      const clientesResult = await this.clienteRepo.findAllByTenant(itemResult.data.empresaId);
      const nombre = clientesResult.success
        ? (clientesResult.data.find((c) => c.email?.toLowerCase() === params.email.toLowerCase())?.nombre ?? null)
        : null;

      return await this.tgtgRepo.claimCupon({
        itemId: params.itemId,
        email: params.email,
        nombre,
        token: params.token,
        tgtgPromoId: params.tgtgPromoId,
        empresaId: itemResult.data.empresaId,
      });
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.claimCupon', { details: { itemId: params.itemId } }) };
    }
  }

  async updateHoras(empresaId: string, tgtgPromoId: string, horaRecogidaInicio: string, horaRecogidaFin: string): Promise<Result<TgtgPromocion>> {
    try {
      const promoResult = await this.tgtgRepo.findPromoById(tgtgPromoId);
      if (!promoResult.success) return promoResult;
      if (!promoResult.data || promoResult.data.empresaId !== empresaId) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Campaña no encontrada', module: 'use-case' } };
      }
      return await this.tgtgRepo.updateHoras(tgtgPromoId, empresaId, horaRecogidaInicio, horaRecogidaFin);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.updateHoras', { empresaId, details: { tgtgPromoId } }) };
    }
  }

  async isTokenUsed(token: string): Promise<Result<boolean>> {
    return this.tgtgRepo.isTokenUsed(token);
  }

  async getPublicItem(itemId: string): Promise<Result<TgtgItem | null>> {
    try {
      return await this.tgtgRepo.findItemById(itemId);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.getPublicItem', { details: { itemId } }) };
    }
  }

  async getPublicPromo(tgtgPromoId: string): Promise<Result<TgtgPromocion | null>> {
    try {
      return await this.tgtgRepo.findPromoById(tgtgPromoId);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.getPublicPromo', { details: { tgtgPromoId } }) };
    }
  }
}
