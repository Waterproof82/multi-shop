import { Result } from "../entities/types";

/**
 * Estado ACTUAL (vivo) del producto al que apuntaba un slug histórico —
 * nunca otro histórico, así un lookup siempre resuelve en un solo salto
 * (product-detail-pages PR5, design decisión #13).
 */
export interface SlugHistoricoProducto {
  productoId: string;
  slugActual: string | null;
  activo: boolean;
}

export interface ISlugHistoricoRepository {
  /**
   * Busca `slugAntiguo` dentro del histórico de ESTE empresaId. `null`
   * cuando no hay histórico para ese slug en este tenant — incluye el caso
   * en que el slug es histórico de OTRO tenant (aislamiento por empresa_id,
   * misma clave primaria compuesta que la tabla).
   */
  buscarProductoPorSlugAntiguo(
    empresaId: string,
    slugAntiguo: string
  ): Promise<Result<SlugHistoricoProducto | null>>;
}
