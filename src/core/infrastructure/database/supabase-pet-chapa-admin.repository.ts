// src/core/infrastructure/database/supabase-pet-chapa-admin.repository.ts
// sdd pet-id-qr-profile, Fase 5 — service_role (getSupabaseClient() salta
// RLS), por eso cada consulta filtra por empresa_id en el código. Segunda
// barrera: el trigger private.pet_chapa_lotes_validar_producto() y la FK
// compuesta (lote_id, empresa_id) de la migración 20261120000001_pet_chapas.sql.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { PetChapaLote, CreatePetChapaLoteInput, RecuentoPorEstado, Paginado, Pagina } from '@/core/domain/entities/pet-chapa-types';
import type { Result, AppError } from '@/core/domain/entities/types';

interface PgErrorLike {
  code?: string;
  message?: string;
}

/**
 * Traduce los códigos de Postgres de esta migración a un `AppError` claro,
 * sin repetir la regla del CHECK/trigger en el código de aplicación — calco
 * de `mapPgError` de `supabase-kit-caducidad.repository.ts`.
 *   23503 → VALIDATION_ERROR (trigger: el producto no es de esta empresa)
 *   23505 → CONFLICT (código de lote duplicado en la empresa)
 */
export function mapPetChapaPgError(error: PgErrorLike, method: string): AppError {
  if (error.code === '23505') {
    return { code: 'CONFLICT', message: 'Ya existe un lote con ese código', module: 'repository', method };
  }
  if (error.code === '23503') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'El producto no es de esta empresa',
      module: 'repository',
      method,
    };
  }
  return { code: 'DB_ERROR', message: error.message ?? 'Error de base de datos', module: 'repository', method };
}

function mapPetChapaLote(row: Record<string, unknown>): PetChapaLote {
  const producto = row.productos as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    productoId: row.producto_id as string,
    codigo: row.codigo as string,
    createdAt: row.created_at as string,
    productoNombre: producto?.titulo_es as string | undefined,
  };
}

export class SupabasePetChapaAdminRepository implements IPetChapaAdminRepository {
  async createLote(empresaId: string, input: CreatePetChapaLoteInput): Promise<Result<PetChapaLote>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pet_chapa_lotes')
        .insert({ empresa_id: empresaId, producto_id: input.productoId, codigo: input.codigo })
        .select('id, empresa_id, producto_id, codigo, created_at')
        .single();

      if (error) {
        return { success: false, error: mapPetChapaPgError(error, 'createLote') };
      }
      return { success: true, data: mapPetChapaLote(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: mapPetChapaPgError(e as PgErrorLike, 'createLote') };
    }
  }

  async findLoteById(empresaId: string, loteId: string): Promise<Result<PetChapaLote | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pet_chapa_lotes')
        .select('id, empresa_id, producto_id, codigo, created_at')
        .eq('empresa_id', empresaId)
        .eq('id', loteId)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapPetChapaPgError(error, 'findLoteById') };
      }
      return { success: true, data: data ? mapPetChapaLote(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: mapPetChapaPgError(e as PgErrorLike, 'findLoteById') };
    }
  }

  // Fase 7 (admin UI): listado paginado por empresa, con el nombre del
  // producto (join de solo lectura, sin PII) — calco de
  // `SupabaseKitCaducidadRepository.findLotes`.
  async findLotes(empresaId: string, pagina: Pagina): Promise<Result<Paginado<PetChapaLote>>> {
    try {
      const supabase = getSupabaseClient();
      const desde = (pagina.page - 1) * pagina.pageSize;
      const hasta = desde + pagina.pageSize - 1;
      const { data, error, count } = await supabase
        .from('pet_chapa_lotes')
        .select('id, empresa_id, producto_id, codigo, created_at, productos(titulo_es)', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(desde, hasta);

      if (error) {
        return { success: false, error: mapPetChapaPgError(error, 'findLotes') };
      }
      return {
        success: true,
        data: {
          items: (data as Record<string, unknown>[]).map(mapPetChapaLote),
          total: count ?? 0,
          page: pagina.page,
          pageSize: pagina.pageSize,
        },
      };
    } catch (e) {
      return { success: false, error: mapPetChapaPgError(e as PgErrorLike, 'findLotes') };
    }
  }

  // R-QR.1.1/DD7: nunca `*` — inserta solo codigo/empresa_id/lote_id; las
  // chapas quedan "libre" (cumple el CHECK pet_chapas_libre_sin_datos, ningún
  // otro campo tiene valor). `ON CONFLICT DO NOTHING RETURNING` vía upsert:
  // solo devuelve los códigos que se insertaron de verdad.
  async insertCodigosIgnorandoDuplicados(empresaId: string, loteId: string, codigos: string[]): Promise<Result<string[]>> {
    try {
      const supabase = getSupabaseClient();
      const rows = codigos.map((codigo) => ({ codigo, empresa_id: empresaId, lote_id: loteId }));
      const { data, error } = await supabase
        .from('pet_chapas')
        .upsert(rows, { onConflict: 'codigo', ignoreDuplicates: true })
        .select('codigo');

      if (error) {
        return { success: false, error: mapPetChapaPgError(error, 'insertCodigosIgnorandoDuplicados') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map((row) => row.codigo as string) };
    } catch (e) {
      return { success: false, error: mapPetChapaPgError(e as PgErrorLike, 'insertCodigosIgnorandoDuplicados') };
    }
  }

  // R-QR.1.2/DD7: tres recuentos con `head: true` — ninguna fila sale nunca
  // de Postgres, solo la cabecera `count`. El `select` nunca lleva una
  // columna de PII (email, telefono, nombre, notas_salud, foto_clave,
  // gestion_token): solo `codigo`, que no es un dato personal (va impreso en
  // la chapa física).
  async countPorEstado(empresaId: string, loteId: string): Promise<Result<RecuentoPorEstado>> {
    try {
      const supabase = getSupabaseClient();
      const base = () =>
        supabase
          .from('pet_chapas')
          .select('codigo', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('lote_id', loteId);

      const [libre, pendiente, activa] = await Promise.all([
        base().is('email', null),
        base().not('email', 'is', null).is('confirmado_at', null),
        base().not('confirmado_at', 'is', null),
      ]);

      if (libre.error) return { success: false, error: mapPetChapaPgError(libre.error, 'countPorEstado') };
      if (pendiente.error) return { success: false, error: mapPetChapaPgError(pendiente.error, 'countPorEstado') };
      if (activa.error) return { success: false, error: mapPetChapaPgError(activa.error, 'countPorEstado') };

      return {
        success: true,
        data: { libre: libre.count ?? 0, pendiente: pendiente.count ?? 0, activa: activa.count ?? 0 },
      };
    } catch (e) {
      return { success: false, error: mapPetChapaPgError(e as PgErrorLike, 'countPorEstado') };
    }
  }

  // R-QR.1.3: calco de `SupabaseKitAvisosRepository.borrar` — una sola
  // `update()` pone a NULL las 13 columnas de perfil (satisface el CHECK
  // `pet_chapas_libre_sin_datos`, la chapa vuelve a "libre"). `.not('email',
  // 'is', null)` limita el update a pendiente/activa: si ya estaba libre o
  // el código no existe, 0 filas y `data: null`.
  async borrarDatos(empresaId: string, codigo: string): Promise<Result<{ codigo: string } | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pet_chapas')
        .update({
          email: null,
          idioma: null,
          gestion_token: null,
          consiente_perfil_at: null,
          texto_consentimiento_version: null,
          confirmado_at: null,
          nombre: null,
          especie: null,
          notas_salud: null,
          foto_clave: null,
          telefono: null,
          telefono_consentido_at: null,
          telefono_texto_version: null,
        })
        .eq('empresa_id', empresaId)
        .eq('codigo', codigo)
        .not('email', 'is', null)
        .select('codigo');

      if (error) {
        return { success: false, error: mapPetChapaPgError(error, 'borrarDatos') };
      }
      const fila = ((data ?? []) as Record<string, unknown>[])[0];
      if (!fila) {
        return { success: true, data: null };
      }
      return { success: true, data: { codigo: fila.codigo as string } };
    } catch (e) {
      return { success: false, error: mapPetChapaPgError(e as PgErrorLike, 'borrarDatos') };
    }
  }
}
