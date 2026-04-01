import { ITgtgRepository } from '@/core/domain/repositories/ITgtgRepository';
import { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import { TgtgPromocion, TgtgItem, TgtgReserva, Result } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

export interface CreateTgtgResult {
  promo: TgtgPromocion;
}

export interface SendEmailsResult {
  promo: TgtgPromocion;
  emailTargets: Array<{ email: string; nombre: string | null; idioma: string | null }>;
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

  async getAllRecent(empresaId: string): Promise<Result<TgtgWithItems[]>> {
    try {
      const recentResult = await this.tgtgRepo.findRecentByTenant(empresaId, 6);
      if (!recentResult.success) return recentResult;

      const all = await Promise.all(
        recentResult.data.map(async (promo) => {
          const itemsResult = await this.tgtgRepo.findItemsByPromo(promo.id);
          return { promo, items: itemsResult.success ? itemsResult.data : [] };
        })
      );
      return { success: true, data: all };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.getAllRecent', { empresaId }) };
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
      const createResult = await this.tgtgRepo.create({
        empresaId,
        horaRecogidaInicio,
        horaRecogidaFin,
        fechaActivacion,
        numeroEnvios: 0,
        items,
      });

      if (!createResult.success) return { success: false, error: createResult.error };

      // Keep only the 6 most recent (delete older ones)
      const recentResult = await this.tgtgRepo.findRecentByTenant(empresaId, 7);
      if (recentResult.success && recentResult.data.length > 6) {
        const toDelete = recentResult.data.slice(6);
        for (const old of toDelete) {
          await this.tgtgRepo.deleteById(old.id, empresaId);
        }
      }

      return { success: true, data: { promo: createResult.data } };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.create', { empresaId }) };
    }
  }

  async sendCampaignEmails(empresaId: string, promoId: string): Promise<Result<SendEmailsResult>> {
    try {
      const promoResult = await this.tgtgRepo.findPromoById(promoId);
      if (!promoResult.success) return promoResult;
      if (!promoResult.data || promoResult.data.empresaId !== empresaId) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Campaña no encontrada', module: 'use-case' } };
      }
      if (promoResult.data.emailEnviado) {
        return { success: false, error: { code: 'ALREADY_SENT', message: 'La campaña ya fue enviada', module: 'use-case' } };
      }

      const clientesResult = await this.clienteRepo.findAllByTenant(empresaId);
      if (!clientesResult.success) return { success: false, error: clientesResult.error };

      const emailTargets = clientesResult.data
        .filter((c) => c.aceptar_promociones && c.email)
        .map((c) => ({ email: c.email as string, nombre: c.nombre, idioma: c.idioma }));

      return { success: true, data: { promo: promoResult.data, emailTargets } };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.sendCampaignEmails', { empresaId, details: { promoId } }) };
    }
  }

  async markEmailSent(empresaId: string, promoId: string, emailCount: number): Promise<Result<TgtgPromocion>> {
    return this.tgtgRepo.markEmailSent(promoId, empresaId, emailCount);
  }

  async getHistory(empresaId: string, excludeId: string): Promise<Result<Array<{ promo: TgtgPromocion; items: TgtgItem[] }>>> {
    try {
      const recentResult = await this.tgtgRepo.findRecentByTenant(empresaId, 6);
      if (!recentResult.success) return recentResult;

      const history = recentResult.data.filter(p => p.id !== excludeId).slice(0, 5);
      const result = await Promise.all(
        history.map(async (promo) => {
          const itemsResult = await this.tgtgRepo.findItemsByPromo(promo.id);
          return { promo, items: itemsResult.success ? itemsResult.data : [] };
        })
      );
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.getHistory', { empresaId }) };
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

  async deletePromo(empresaId: string, promoId: string): Promise<Result<void>> {
    try {
      const promoResult = await this.tgtgRepo.findPromoById(promoId);
      if (!promoResult.success) return promoResult;
      if (!promoResult.data || promoResult.data.empresaId !== empresaId) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Campaña no encontrada', module: 'use-case' } };
      }
      if (promoResult.data.emailEnviado) {
        return { success: false, error: { code: 'ALREADY_SENT', message: 'No se puede eliminar una campaña ya enviada', module: 'use-case' } };
      }
      const reservasResult = await this.tgtgRepo.findReservasByPromo(promoId, empresaId);
      if (reservasResult.success && reservasResult.data.length > 0) {
        return { success: false, error: { code: 'HAS_RESERVAS', message: 'No se puede eliminar una campaña con reservas activas', module: 'use-case' } };
      }
      return await this.tgtgRepo.deleteById(promoId, empresaId);
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TgtgUseCase.deletePromo', { empresaId, details: { promoId } }) };
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
