import { SupabaseClient } from "@supabase/supabase-js";
import {
  IModalidadEntregaRepository,
  CreateModalidadEntregaData,
  UpdateModalidadEntregaData,
} from "@/core/domain/repositories/IModalidadEntregaRepository";
import { ModalidadEntrega, Result } from "@/core/domain/entities/types";
import { logger } from "../logging/logger";
import { camposPresentes } from "./update-payload";

const CAMPOS_MODALIDAD = [
  "icono",
  "nombre_es",
  "nombre_en",
  "nombre_fr",
  "nombre_it",
  "nombre_de",
  "precioCents",
  "tiempoMinMinutos",
  "tiempoMaxMinutos",
  "orden",
  "activo",
] as const satisfies ReadonlyArray<keyof UpdateModalidadEntregaData>;

function mapToDomain(row: Record<string, unknown>): ModalidadEntrega {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    tipo: row.tipo as "recogida" | "domicilio",
    icono: row.icono as string,
    nombre: row.nombre_es as string,
    translations: {
      en: (row.nombre_en as string | undefined) || undefined,
      fr: (row.nombre_fr as string | undefined) || undefined,
      it: (row.nombre_it as string | undefined) || undefined,
      de: (row.nombre_de as string | undefined) || undefined,
    },
    precioCents: row.precio_cents as number,
    tiempoMinMinutos: (row.tiempo_min_minutos as number | null) ?? null,
    tiempoMaxMinutos: (row.tiempo_max_minutos as number | null) ?? null,
    activo: row.activo as boolean,
    orden: (row.orden as number) ?? 0,
  };
}

export class SupabaseModalidadEntregaRepository
  implements IModalidadEntregaRepository
{
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(
    empresaId: string
  ): Promise<Result<ModalidadEntrega[]>> {
    try {
      const { data, error } = await this.supabase
        .from("modalidades_entrega")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("tipo", { ascending: true })
        .order("orden", { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          "DB_SELECT_ERROR",
          error.message,
          "repository",
          "SupabaseModalidadEntregaRepository.findAllByTenant",
          {
            empresaId,
            details: { code: error.code, hint: error.hint },
          }
        );
        return {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Error al obtener modalidades de entrega",
            module: "repository",
            method: "findAllByTenant",
          },
        };
      }
      return { success: true, data: data.map(mapToDomain) };
    } catch (e) {
      const appError = await logger.logFromCatch(
        e,
        "repository",
        "SupabaseModalidadEntregaRepository.findAllByTenant",
        { empresaId }
      );
      return { success: false, error: appError };
    }
  }

  async findActivasPublicas(
    empresaId: string
  ): Promise<Result<ModalidadEntrega[]>> {
    try {
      const { data, error } = await this.supabase
        .from("modalidades_entrega")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("tipo", { ascending: true })
        .order("orden", { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          "DB_SELECT_ERROR",
          error.message,
          "repository",
          "SupabaseModalidadEntregaRepository.findActivasPublicas",
          {
            empresaId,
            details: { code: error.code, hint: error.hint },
          }
        );
        return {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Error al obtener modalidades de entrega",
            module: "repository",
            method: "findActivasPublicas",
          },
        };
      }
      return { success: true, data: data.map(mapToDomain) };
    } catch (e) {
      const appError = await logger.logFromCatch(
        e,
        "repository",
        "SupabaseModalidadEntregaRepository.findActivasPublicas",
        { empresaId }
      );
      return { success: false, error: appError };
    }
  }

  async findById(
    id: string,
    empresaId: string
  ): Promise<Result<ModalidadEntrega | null>> {
    try {
      const { data, error } = await this.supabase
        .from("modalidades_entrega")
        .select("*")
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          "DB_SELECT_ERROR",
          error.message,
          "repository",
          "SupabaseModalidadEntregaRepository.findById",
          {
            empresaId,
            details: { code: error.code, hint: error.hint, modalidadId: id },
          }
        );
        return {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Error al obtener la modalidad de entrega",
            module: "repository",
            method: "findById",
          },
        };
      }
      return { success: true, data: data ? mapToDomain(data) : null };
    } catch (e) {
      const appError = await logger.logFromCatch(
        e,
        "repository",
        "SupabaseModalidadEntregaRepository.findById",
        { empresaId }
      );
      return { success: false, error: appError };
    }
  }

  async create(
    data: CreateModalidadEntregaData
  ): Promise<Result<ModalidadEntrega>> {
    try {
      const { data: created, error } = await this.supabase
        .from("modalidades_entrega")
        .insert({
          empresa_id: data.empresaId,
          tipo: data.tipo,
          icono: data.icono,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en || null,
          nombre_fr: data.nombre_fr || null,
          nombre_it: data.nombre_it || null,
          nombre_de: data.nombre_de || null,
          precio_cents: data.precioCents,
          tiempo_min_minutos:
            data.tipo === "domicilio" ? (data.tiempoMinMinutos ?? null) : null,
          tiempo_max_minutos:
            data.tipo === "domicilio" ? (data.tiempoMaxMinutos ?? null) : null,
          orden: data.orden ?? 0,
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          "DB_INSERT_ERROR",
          error.message,
          "repository",
          "SupabaseModalidadEntregaRepository.create",
          {
            empresaId: data.empresaId,
            details: { code: error.code, hint: error.hint },
          }
        );
        return {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Error al crear la modalidad de entrega",
            module: "repository",
            method: "create",
          },
        };
      }
      return { success: true, data: mapToDomain(created) };
    } catch (e) {
      const appError = await logger.logFromCatch(
        e,
        "repository",
        "SupabaseModalidadEntregaRepository.create",
        { empresaId: data.empresaId }
      );
      return { success: false, error: appError };
    }
  }

  async update(
    id: string,
    empresaId: string,
    data: UpdateModalidadEntregaData
  ): Promise<Result<ModalidadEntrega>> {
    try {
      const updatePayload: Record<string, unknown> = camposPresentes(
        data,
        CAMPOS_MODALIDAD
      );

      // Remap camelCase to snake_case
      if ("precioCents" in updatePayload) {
        updatePayload.precio_cents = updatePayload.precioCents;
        delete updatePayload.precioCents;
      }
      if ("tiempoMinMinutos" in updatePayload) {
        updatePayload.tiempo_min_minutos = updatePayload.tiempoMinMinutos;
        delete updatePayload.tiempoMinMinutos;
      }
      if ("tiempoMaxMinutos" in updatePayload) {
        updatePayload.tiempo_max_minutos = updatePayload.tiempoMaxMinutos;
        delete updatePayload.tiempoMaxMinutos;
      }

      const { data: updated, error } = await this.supabase
        .from("modalidades_entrega")
        .update(updatePayload)
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          "DB_UPDATE_ERROR",
          error.message,
          "repository",
          "SupabaseModalidadEntregaRepository.update",
          {
            empresaId,
            details: { code: error.code, hint: error.hint, modalidadId: id },
          }
        );
        return {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Error al actualizar la modalidad de entrega",
            module: "repository",
            method: "update",
          },
        };
      }
      return { success: true, data: mapToDomain(updated) };
    } catch (e) {
      const appError = await logger.logFromCatch(
        e,
        "repository",
        "SupabaseModalidadEntregaRepository.update",
        { empresaId }
      );
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from("modalidades_entrega")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          "DB_DELETE_ERROR",
          error.message,
          "repository",
          "SupabaseModalidadEntregaRepository.delete",
          {
            empresaId,
            details: { code: error.code, hint: error.hint, modalidadId: id },
          }
        );
        return {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Error al borrar la modalidad de entrega",
            module: "repository",
            method: "delete",
          },
        };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(
        e,
        "repository",
        "SupabaseModalidadEntregaRepository.delete",
        { empresaId }
      );
      return { success: false, error: appError };
    }
  }
}
