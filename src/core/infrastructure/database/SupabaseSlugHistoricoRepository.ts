import { SupabaseClient } from "@supabase/supabase-js";
import type { ISlugHistoricoRepository, SlugHistoricoProducto } from "@/core/domain/repositories/ISlugHistoricoRepository";
import type { Result } from "@/core/domain/entities/types";
import { logger } from "../logging/logger";

interface ProductoVivoRow {
  activo: boolean;
  slug: string | null;
}

export class SupabaseSlugHistoricoRepository implements ISlugHistoricoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Un solo round-trip: `productos_slug_historial` ya está scoped a
   * `empresa_id` (parte de su clave primaria), y el join a `productos`
   * trae el estado VIVO del producto (activo/slug) — nunca otro histórico,
   * así un lookup nunca puede encadenar más de un salto (A→B→A resuelve
   * siempre en uno, design decisión #13).
   */
  async buscarProductoPorSlugAntiguo(
    empresaId: string,
    slugAntiguo: string
  ): Promise<Result<SlugHistoricoProducto | null>> {
    try {
      const { data, error } = await this.supabase
        .from("productos_slug_historial")
        .select("producto_id, productos!inner(activo, slug)")
        .eq("empresa_id", empresaId)
        .eq("slug_antiguo", slugAntiguo)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseSlugHistoricoRepository.buscarProductoPorSlugAntiguo',
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al consultar histórico de slugs',
            module: 'repository',
            method: 'buscarProductoPorSlugAntiguo',
          },
        };
      }

      if (!data) return { success: true, data: null };

      const producto = data.productos as unknown as ProductoVivoRow;
      return {
        success: true,
        data: {
          productoId: data.producto_id as string,
          slugActual: producto.slug,
          activo: producto.activo,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseSlugHistoricoRepository.buscarProductoPorSlugAntiguo', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }
}
