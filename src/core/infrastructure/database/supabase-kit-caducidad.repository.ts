// src/core/infrastructure/database/supabase-kit-caducidad.repository.ts
// kit-expiry-reminders M4a2: service_role (getSupabaseClient() salta RLS), por
// eso cada consulta filtra por empresa_id en el código. Segunda barrera: el
// trigger private.kit_caducidades_validar_empresa (M1) y las FK compuestas
// (lote_id, empresa_id) de la migración 20261117000001_kit_caducidades.sql.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type {
  ProductoKit, ConsumibleKit, KitLote, KitLoteCaducidad, CaducidadInput, LineaCandidata,
  Paginado, CreateKitLoteInput, Pagina,
} from '@/core/domain/entities/kit-caducidad-types';
import type { Result, AppError } from '@/core/domain/entities/types';

interface PgErrorLike {
  code?: string;
  message?: string;
}

/**
 * DD6: traduce los códigos de Postgres que puede lanzar esta migración a un
 * `AppError` con un mensaje claro, sin repetir la regla del CHECK/trigger en
 * el código de aplicación.
 *   23503/23514 → VALIDATION_ERROR (FK del trigger o CHECK `una_fuente`)
 *   23505       → CONFLICT (código de lote duplicado en la empresa)
 *   P0002       → KIT_LOTE_NOT_FOUND (RPC: el lote no existe para la empresa)
 */
export function mapPgError(error: PgErrorLike, method: string): AppError {
  if (error.code === '23505') {
    return { code: 'CONFLICT', message: 'Ya existe un lote con ese código', module: 'repository', method };
  }
  if (error.code === '23503' || error.code === '23514') {
    return {
      code: 'VALIDATION_ERROR',
      message: 'La línea de albarán no es de este consumible o no tiene fecha, o cada consumible lleva una sola fuente de fecha',
      module: 'repository',
      method,
    };
  }
  if (error.code === 'P0002') {
    return { code: 'KIT_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'repository', method };
  }
  return { code: 'DB_ERROR', message: error.message ?? 'Error de base de datos', module: 'repository', method };
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapKitLote(row: Record<string, unknown>): KitLote {
  const producto = row.productos as Record<string, unknown> | null | undefined;
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    productoId: row.producto_id as string,
    codigo: row.codigo as string,
    fechaMontaje: row.fecha_montaje as string,
    createdAt: row.created_at as string,
    productoNombre: producto?.titulo_es as string | undefined,
  };
}

function mapKitLoteCaducidad(row: Record<string, unknown>): KitLoteCaducidad {
  return {
    ingredienteId: row.ingrediente_id as string,
    parte: row.parte as string,
    albaranCompraItemId: (row.albaran_compra_item_id as string | null) ?? null,
    caducaEl: (row.caduca_el as string | null) ?? null,
  };
}

function mapConsumibleKit(row: Record<string, unknown>): ConsumibleKit {
  const ingrediente = row.ingredientes as Record<string, unknown> | null | undefined;
  return {
    ingredienteId: row.ingrediente_id as string,
    nombre: (ingrediente?.nombre as string) ?? '',
    esPerecedero: Boolean(ingrediente?.es_perecedero),
  };
}

function mapLineaCandidata(row: Record<string, unknown>): LineaCandidata {
  const albaran = row.albaranes_compra as Record<string, unknown> | null | undefined;
  const catalogo = row.catalogo_compra as Record<string, unknown> | null | undefined;
  return {
    albaranCompraItemId: row.id as string,
    ingredienteId: catalogo?.ingrediente_id as string,
    numeroLote: (row.numero_lote as string | null) ?? null,
    fechaCaducidad: row.fecha_caducidad as string,
    numeroAlbaran: albaran?.numero_albaran as string,
    fechaRecepcion: albaran?.fecha_recepcion as string,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SupabaseKitCaducidadRepository implements IKitCaducidadRepository {
  async findProductosKit(empresaId: string): Promise<Result<ProductoKit[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('productos')
        .select('id, titulo_es, receta_items!inner(ingredientes!inner(es_perecedero))')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .eq('receta_items.ingredientes.es_perecedero', true);

      if (error) {
        return { success: false, error: mapPgError(error, 'findProductosKit') };
      }

      const vistos = new Set<string>();
      const productos: ProductoKit[] = [];
      for (const row of data as Record<string, unknown>[]) {
        const id = row.id as string;
        if (vistos.has(id)) continue;
        vistos.add(id);
        productos.push({ id, nombre: row.titulo_es as string });
      }
      return { success: true, data: productos };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findProductosKit') };
    }
  }

  async findConsumiblesDelKit(empresaId: string, productoId: string): Promise<Result<ConsumibleKit[]>> {
    try {
      const supabase = getSupabaseClient();
      // R-M4.2.3: un producto de otra empresa no revela sus consumibles.
      const { data: producto, error: productoError } = await supabase
        .from('productos')
        .select('id')
        .eq('id', productoId)
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (productoError) {
        return { success: false, error: mapPgError(productoError, 'findConsumiblesDelKit') };
      }
      if (!producto) {
        return { success: true, data: [] };
      }

      const { data, error } = await supabase
        .from('receta_items')
        .select('ingrediente_id, ingredientes(nombre, es_perecedero)')
        .eq('producto_id', productoId);

      if (error) {
        return { success: false, error: mapPgError(error, 'findConsumiblesDelKit') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapConsumibleKit) };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findConsumiblesDelKit') };
    }
  }

  async createLote(empresaId: string, input: CreateKitLoteInput): Promise<Result<KitLote>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kit_lotes')
        .insert({
          empresa_id: empresaId,
          producto_id: input.productoId,
          codigo: input.codigo,
          fecha_montaje: input.fechaMontaje,
        })
        .select('*, productos(titulo_es)')
        .single();

      if (error) {
        return { success: false, error: mapPgError(error, 'createLote') };
      }
      return { success: true, data: mapKitLote(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'createLote') };
    }
  }

  async findLotes(empresaId: string, pagina: Pagina): Promise<Result<Paginado<KitLote>>> {
    try {
      const supabase = getSupabaseClient();
      const desde = (pagina.page - 1) * pagina.pageSize;
      const hasta = desde + pagina.pageSize - 1;
      const { data, error, count } = await supabase
        .from('kit_lotes')
        .select('*, productos(titulo_es)', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(desde, hasta);

      if (error) {
        return { success: false, error: mapPgError(error, 'findLotes') };
      }
      return {
        success: true,
        data: {
          items: (data as Record<string, unknown>[]).map(mapKitLote),
          total: count ?? 0,
          page: pagina.page,
          pageSize: pagina.pageSize,
        },
      };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findLotes') };
    }
  }

  async findLoteById(empresaId: string, loteId: string): Promise<Result<KitLote | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kit_lotes')
        .select('*, productos(titulo_es)')
        .eq('empresa_id', empresaId)
        .eq('id', loteId)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapPgError(error, 'findLoteById') };
      }
      return { success: true, data: data ? mapKitLote(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findLoteById') };
    }
  }

  async findCaducidades(empresaId: string, loteId: string): Promise<Result<KitLoteCaducidad[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kit_lote_caducidades')
        .select('ingrediente_id, parte, albaran_compra_item_id, caduca_el')
        .eq('empresa_id', empresaId)
        .eq('lote_id', loteId);

      if (error) {
        return { success: false, error: mapPgError(error, 'findCaducidades') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapKitLoteCaducidad) };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findCaducidades') };
    }
  }

  // DD5: reemplazo transaccional vía RPC (no delete+insert por PostgREST) —
  // si el CHECK/trigger falla, el lote conserva el conjunto anterior en vez
  // de quedarse sin fechas.
  async replaceCaducidades(empresaId: string, loteId: string, items: CaducidadInput[]): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc('kit_lote_reemplazar_caducidades', {
        p_empresa_id: empresaId,
        p_lote_id: loteId,
        p_items: items.map((item) => ({
          ingrediente_id: item.ingredienteId,
          parte: item.parte,
          albaran_compra_item_id: item.albaranCompraItemId,
          caduca_el: item.caducaEl,
        })),
      });

      if (error) {
        return { success: false, error: mapPgError(error, 'replaceCaducidades') };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'replaceCaducidades') };
    }
  }

  // DD8: solo albaranes `recibido` (inalterables, Ley 11/2021), con fecha de
  // caducidad futura; las líneas ya usadas por otros lotes no se excluyen
  // (D-M4-3). `ingredienteIds` vacío no llega aquí — el caso de uso corta
  // antes de llamar si el kit no tiene consumibles perecederos.
  async findLineasCandidatas(empresaId: string, ingredienteIds: string[], desde: string): Promise<Result<LineaCandidata[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('albaranes_compra_items')
        .select('id, numero_lote, fecha_caducidad, albaranes_compra!inner(numero_albaran, fecha_recepcion, empresa_id, estado), catalogo_compra!inner(ingrediente_id)')
        .eq('albaranes_compra.empresa_id', empresaId)
        .eq('albaranes_compra.estado', 'recibido')
        .in('catalogo_compra.ingrediente_id', ingredienteIds)
        .not('fecha_caducidad', 'is', null)
        .gte('fecha_caducidad', desde)
        .order('fecha_caducidad', { ascending: true })
        .limit(200);

      if (error) {
        return { success: false, error: mapPgError(error, 'findLineasCandidatas') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapLineaCandidata) };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findLineasCandidatas') };
    }
  }

  // R-M4.3.5: autocompletado de `parte`, solo valores ya usados por la propia empresa.
  async findPartesUsadas(empresaId: string): Promise<Result<string[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kit_lote_caducidades')
        .select('parte')
        .eq('empresa_id', empresaId)
        .neq('parte', '');

      if (error) {
        return { success: false, error: mapPgError(error, 'findPartesUsadas') };
      }
      const partes = new Set<string>();
      for (const row of data as Record<string, unknown>[]) {
        const parte = row.parte as string;
        if (parte) partes.add(parte);
      }
      return { success: true, data: Array.from(partes).sort() };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findPartesUsadas') };
    }
  }
}
