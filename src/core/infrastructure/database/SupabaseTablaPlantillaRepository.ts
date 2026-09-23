import { SupabaseClient } from "@supabase/supabase-js";
import { ITablaPlantillaRepository, CreateTablaPlantillaData } from "@/core/domain/repositories/ITablaPlantillaRepository";
import { TablaCelda, TablaPlantilla, Result } from "@/core/domain/entities/types";
import { logger } from "../logging/logger";

function mapToDomain(row: Record<string, unknown>): TablaPlantilla {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    nombre: row.nombre as string,
    columnas: (row.tabla_info as { columnas: TablaCelda[] }).columnas,
    createdAt: new Date(row.created_at as string),
  };
}

export class SupabaseTablaPlantillaRepository implements ITablaPlantillaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Result<TablaPlantilla[]>> {
    try {
      const { data, error } = await this.supabase
        .from("tabla_plantillas")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("nombre", { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          "DB_SELECT_ERROR",
          error.message,
          "repository",
          "SupabaseTablaPlantillaRepository.findAllByTenant",
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return {
          success: false,
          error: { code: "DB_ERROR", message: "Error al obtener las plantillas de tabla", module: "repository", method: "findAllByTenant" },
        };
      }
      return { success: true, data: data.map(mapToDomain) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, "repository", "SupabaseTablaPlantillaRepository.findAllByTenant", { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateTablaPlantillaData): Promise<Result<TablaPlantilla>> {
    try {
      const { data: created, error } = await this.supabase
        .from("tabla_plantillas")
        .insert({
          empresa_id: data.empresaId,
          nombre: data.nombre,
          tabla_info: { columnas: data.columnas },
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          "DB_INSERT_ERROR",
          error.message,
          "repository",
          "SupabaseTablaPlantillaRepository.create",
          { empresaId: data.empresaId, details: { code: error.code, hint: error.hint } }
        );
        return {
          success: false,
          error: { code: "DB_ERROR", message: "Error al guardar la plantilla de tabla", module: "repository", method: "create" },
        };
      }
      return { success: true, data: mapToDomain(created) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, "repository", "SupabaseTablaPlantillaRepository.create", { empresaId: data.empresaId });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from("tabla_plantillas")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          "DB_DELETE_ERROR",
          error.message,
          "repository",
          "SupabaseTablaPlantillaRepository.delete",
          { empresaId, details: { code: error.code, hint: error.hint, plantillaId: id } }
        );
        return {
          success: false,
          error: { code: "DB_ERROR", message: "Error al borrar la plantilla de tabla", module: "repository", method: "delete" },
        };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, "repository", "SupabaseTablaPlantillaRepository.delete", { empresaId });
      return { success: false, error: appError };
    }
  }
}
