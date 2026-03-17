import { Promocion, Result } from "../entities/types";

export interface IPromocionRepository {
  findAllByTenant(empresaId: string): Promise<Result<Promocion[]>>;
  create(data: { empresaId: string; texto_promocion: string; imagen_url?: string; numero_envios: number }): Promise<Result<Promocion>>;
  deleteAllByTenant(empresaId: string): Promise<Result<void>>;
}
