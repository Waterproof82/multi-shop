import { IPromocionRepository } from "@/core/domain/repositories/IPromocionRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { Promocion } from "@/core/domain/entities/types";

export interface CreatePromocionResult {
  promo: Promocion;
  oldImageUrl: string | null;
  emailTargets: string[];
}

export class PromocionUseCase {
  constructor(
    private readonly promocionRepo: IPromocionRepository,
    private readonly clienteRepo: IClienteRepository,
  ) {}

  async getAll(empresaId: string): Promise<Promocion[]> {
    return this.promocionRepo.findAllByTenant(empresaId);
  }

  async create(empresaId: string, texto_promocion: string, imagen_url?: string | null): Promise<CreatePromocionResult> {
    const [clientes, oldPromos] = await Promise.all([
      this.clienteRepo.findAllByTenant(empresaId),
      this.promocionRepo.findAllByTenant(empresaId),
    ]);

    const emailTargets = clientes
      .filter(c => c.aceptar_promociones && c.email)
      .map(c => c.email as string);

    const oldImageUrl = oldPromos[0]?.imagen_url ?? null;

    await this.promocionRepo.deleteAllByTenant(empresaId);

    const promo = await this.promocionRepo.create({
      empresaId,
      texto_promocion,
      imagen_url: imagen_url ?? undefined,
      numero_envios: emailTargets.length,
    });

    return { promo, oldImageUrl, emailTargets };
  }
}
