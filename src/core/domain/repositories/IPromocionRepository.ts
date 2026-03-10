import { Promocion } from "../entities/types";

export interface IPromocionRepository {
  findAllByTenant(empresaId: string): Promise<Promocion[]>;
  create(data: { empresaId: string; texto_promocion: string; imagen_url?: string; numero_envios: number }): Promise<Promocion>;
  deleteAllByTenant(empresaId: string): Promise<void>;
}
