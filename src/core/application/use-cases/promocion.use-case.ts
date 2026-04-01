import { IPromocionRepository } from "@/core/domain/repositories/IPromocionRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { Promocion, Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";

export interface CreatePromocionResult {
  promo: Promocion;
  oldImageUrl: string | null;
  emailTargets: Array<{ email: string; idioma: string | null }>;
}

export class PromocionUseCase {
  constructor(
    private readonly promocionRepo: IPromocionRepository,
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async getAll(empresaId: string): Promise<Result<Promocion[]>> {
    try {
      const result = await this.promocionRepo.findAllByTenant(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PromocionUseCase.getAll' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PromocionUseCase.getAll', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(empresaId: string, texto_promocion: string, imagen_url: string | null | undefined, fecha_fin: string): Promise<Result<CreatePromocionResult>> {
    try {
      const [clientesResult, oldPromosResult] = await Promise.all([
        this.clienteRepo.findAllByTenant(empresaId),
        this.promocionRepo.findAllByTenant(empresaId),
      ]);

      if (!clientesResult.success) {
        return { success: false, error: clientesResult.error };
      }

      const clientes = clientesResult.data;
      const emailTargets = clientes
        .filter(c => c.aceptar_promociones && c.email)
        .map(c => ({ email: c.email as string, idioma: c.idioma }));

      const oldImageUrl = oldPromosResult.success && oldPromosResult.data[0] ? oldPromosResult.data[0].imagen_url : null;

      const deleteResult = await this.promocionRepo.deleteAllByTenant(empresaId);
      if (!deleteResult.success) {
        return { success: false, error: deleteResult.error };
      }

      const createResult = await this.promocionRepo.create({
        empresaId,
        texto_promocion,
        imagen_url: imagen_url ?? undefined,
        numero_envios: emailTargets.length,
        fecha_fin,
      });

      if (!createResult.success) {
        return { success: false, error: createResult.error };
      }

      return { 
        success: true, 
        data: { 
          promo: createResult.data, 
          oldImageUrl, 
          emailTargets 
        } 
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PromocionUseCase.create', { empresaId });
      return { success: false, error: appError };
    }
  }
}
