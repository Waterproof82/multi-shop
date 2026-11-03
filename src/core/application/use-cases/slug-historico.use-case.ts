import type { ISlugHistoricoRepository } from "@/core/domain/repositories/ISlugHistoricoRepository";
import type { Result } from "@/core/domain/entities/types";

export class SlugHistoricoUseCase {
  constructor(private readonly repo: ISlugHistoricoRepository) {}

  /**
   * Resuelve a qué slug ACTUAL debe redirigir un slug antiguo, scoped a
   * `empresaId`. Devuelve `null` (sin redirect, el loader lo trata como
   * 'no-encontrado') cuando no hay histórico para este tenant, el producto
   * ya no está activo, o se quedó sin slug — nunca se redirige a una URL
   * que a su vez volvería a dar 404 (spec PR5: inactive product 404,
   * cross-tenant isolation).
   */
  async resolverSlugActual(empresaId: string, slugAntiguo: string): Promise<Result<string | null>> {
    const result = await this.repo.buscarProductoPorSlugAntiguo(empresaId, slugAntiguo);
    if (!result.success) return result;

    const producto = result.data;
    if (!producto || !producto.activo || !producto.slugActual) {
      return { success: true, data: null };
    }

    return { success: true, data: producto.slugActual };
  }
}
