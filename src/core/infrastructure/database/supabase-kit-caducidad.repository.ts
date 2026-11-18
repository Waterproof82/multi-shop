// src/core/infrastructure/database/supabase-kit-caducidad.repository.ts
// kit-expiry-reminders M4a2: service_role (getSupabaseClient() salta RLS), por
// eso cada consulta filtra por empresa_id en el código. Segunda barrera: el
// trigger private.kit_caducidades_validar_empresa (M1) y las FK compuestas
// (lote_id, empresa_id) de la migración 20261117000001_kit_caducidades.sql.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type {
  ProductoKit, ConsumibleKit, KitLote, KitLoteCaducidad, CaducidadInput, LineaCandidata, KitSerie,
  KitRegistradoListado, ContactoKit, Paginado, CreateKitLoteInput, Pagina, KitPublico,
} from '@/core/domain/entities/kit-caducidad-types';
import { enmascararEmail, enmascararTelefono } from '@/lib/kit-caducidad/pii';
import type { Caducidad } from '@/lib/kit-caducidad/estado';

/** DD11: tope del bloque de `.range()` al exportar todas las series de un lote. */
const BLOQUE_EXPORTACION_SERIES = 1000;
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
 *
 * `serie`, si se pasa (kit-expiry-m2a, R-M2a.5.1), se trunca a 8 caracteres
 * en el mensaje — igual que en M5 — para que un log nunca lleve la serie
 * completa de un cliente.
 */
export function mapPgError(error: PgErrorLike, method: string, serie?: string): AppError {
  const sufijo = serie ? ` (serie ${serie.slice(0, 8)}…)` : '';
  if (error.code === '23505') {
    return { code: 'CONFLICT', message: `Ya existe un lote con ese código${sufijo}`, module: 'repository', method };
  }
  if (error.code === '23503' || error.code === '23514') {
    return {
      code: 'VALIDATION_ERROR',
      message: `La línea de albarán no es de este consumible o no tiene fecha, o cada consumible lleva una sola fuente de fecha${sufijo}`,
      module: 'repository',
      method,
    };
  }
  if (error.code === 'P0002') {
    return { code: 'KIT_LOTE_NOT_FOUND', message: `Lote no encontrado${sufijo}`, module: 'repository', method };
  }
  return { code: 'DB_ERROR', message: `${error.message ?? 'Error de base de datos'}${sufijo}`, module: 'repository', method };
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

function mapKitSerie(row: Record<string, unknown>): KitSerie {
  return {
    serie: row.serie as string,
    loteId: row.lote_id as string,
    empresaId: row.empresa_id as string,
    pedidoId: (row.pedido_id as string | null) ?? null,
    registradoAt: (row.registrado_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// R-M4.5.2/R-M4.5.3/DD12: el email/telefono SIEMPRE pasan por `pii.ts` antes
// de salir de aquí — el valor completo solo lo devuelve `mapContactoKit`,
// usado exclusivamente por `findContacto` (reveal explícito, nunca el listado).
function mapKitRegistradoListado(row: Record<string, unknown>): KitRegistradoListado {
  return {
    serie: row.serie as string,
    loteId: row.lote_id as string,
    pedidoId: (row.pedido_id as string | null) ?? null,
    emailMasked: enmascararEmail((row.email as string | null) ?? null),
    telefonoMasked: enmascararTelefono((row.telefono as string | null) ?? null),
    registradoAt: (row.registrado_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapContactoKit(row: Record<string, unknown>): ContactoKit {
  return {
    serie: row.serie as string,
    email: (row.email as string | null) ?? null,
    telefono: (row.telefono as string | null) ?? null,
  };
}

// kit-expiry-m2a (R-M2a.2.3): fila de la vista `kit_lote_caducidades_efectivas`
// — nunca lleva PII, solo lo que ya calcula la vista en SQL (DD6).
export function mapCaducidadEfectiva(row: Record<string, unknown>): Caducidad {
  return {
    ingredienteId: row.ingrediente_id as string,
    consumible: row.consumible as string,
    parte: row.parte as string,
    caducaEl: row.caduca_el as string,
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

  // DD10: `ON CONFLICT DO NOTHING RETURNING` vía upsert — solo devuelve las
  // series que realmente se insertaron; `pedido_id` queda NULL (el vínculo
  // con pedidos queda fuera de M4, R-M4.4.4). El caso de uso reintenta lo
  // que falte si una colisión descarta alguna fila.
  async insertSeriesIgnorandoDuplicados(empresaId: string, loteId: string, series: string[]): Promise<Result<string[]>> {
    try {
      const supabase = getSupabaseClient();
      const rows = series.map((serie) => ({ serie, empresa_id: empresaId, lote_id: loteId, pedido_id: null }));
      const { data, error } = await supabase
        .from('kits_registrados')
        .upsert(rows, { onConflict: 'serie', ignoreDuplicates: true })
        .select('serie');

      if (error) {
        return { success: false, error: mapPgError(error, 'insertSeriesIgnorandoDuplicados') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map((row) => row.serie as string) };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'insertSeriesIgnorandoDuplicados') };
    }
  }

  // DD11: exportación completa de las series de un lote, sin tope de 1000 —
  // recorre `.range()` en bloques hasta agotar, para que M5 la consuma.
  // DD7 (kit-expiry-m5): desempate por `serie` tras `created_at` — una
  // misma tanda de `generarSeriesLoteUseCase` comparte `created_at`, así que
  // sin este segundo `order` el orden entre peticiones no es estable y la
  // paginación de las etiquetas PDF podría repetir u omitir series.
  async findSeriesDeLote(empresaId: string, loteId: string): Promise<Result<KitSerie[]>> {
    try {
      const supabase = getSupabaseClient();
      const series: KitSerie[] = [];

      for (let desde = 0; ; desde += BLOQUE_EXPORTACION_SERIES) {
        const { data, error } = await supabase
          .from('kits_registrados')
          .select('serie, lote_id, empresa_id, pedido_id, registrado_at, created_at')
          .eq('empresa_id', empresaId)
          .eq('lote_id', loteId)
          .order('created_at', { ascending: true })
          .order('serie', { ascending: true })
          .range(desde, desde + BLOQUE_EXPORTACION_SERIES - 1);

        if (error) {
          return { success: false, error: mapPgError(error, 'findSeriesDeLote') };
        }
        const filas = data as Record<string, unknown>[];
        series.push(...filas.map(mapKitSerie));
        if (filas.length < BLOQUE_EXPORTACION_SERIES) break;
      }

      return { success: true, data: series };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findSeriesDeLote') };
    }
  }

  // R-M4.5.1/DD11: paginación real con `count: 'exact'`; desempate por
  // `serie` porque las filas de una misma tanda de generación comparten
  // `created_at`. El email/telefono SIEMPRE se enmascaran aquí (DD12) —
  // nunca salen completos de este método.
  async findRegistrados(empresaId: string, pagina: Pagina): Promise<Result<Paginado<KitRegistradoListado>>> {
    try {
      const supabase = getSupabaseClient();
      const desde = (pagina.page - 1) * pagina.pageSize;
      const hasta = desde + pagina.pageSize - 1;
      const { data, error, count } = await supabase
        .from('kits_registrados')
        .select('serie, lote_id, pedido_id, email, telefono, registrado_at, created_at', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .order('serie', { ascending: true })
        .range(desde, hasta);

      if (error) {
        return { success: false, error: mapPgError(error, 'findRegistrados') };
      }
      return {
        success: true,
        data: {
          items: (data as Record<string, unknown>[]).map(mapKitRegistradoListado),
          total: count ?? 0,
          page: pagina.page,
          pageSize: pagina.pageSize,
        },
      };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findRegistrados') };
    }
  }

  // R-M4.5.2: único método del repositorio que devuelve el email/telefono
  // completos — lo consume solo `verContactoKitUseCase` (reveal explícito).
  async findContacto(empresaId: string, serie: string): Promise<Result<ContactoKit | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kits_registrados')
        .select('serie, email, telefono')
        .eq('empresa_id', empresaId)
        .eq('serie', serie)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapPgError(error, 'findContacto') };
      }
      return { success: true, data: data ? mapContactoKit(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findContacto') };
    }
  }

  // kit-expiry-m2a (R-M2a.1.2/R-M2a.2.1/DD6): DOS consultas, sin embed por la
  // FK compuesta. El `select` de `kits_registrados` es SOLO `lote_id` — nunca
  // email, telefono ni `*` — porque esta ruta es pública y no debe poder
  // revelar ni un dato personal, ni siquiera por accidente de un select
  // amplio. El mensaje de error solo lleva la serie truncada (R-M2a.5.1).
  async findKitPublico(empresaId: string, serie: string): Promise<Result<KitPublico | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data: registrado, error: registradoError } = await supabase
        .from('kits_registrados')
        .select('lote_id')
        .eq('empresa_id', empresaId)
        .eq('serie', serie)
        .maybeSingle();

      if (registradoError) {
        return { success: false, error: mapPgError(registradoError, 'findKitPublico', serie) };
      }
      if (!registrado) {
        return { success: true, data: null };
      }

      const loteId = (registrado as Record<string, unknown>).lote_id as string;
      const { data: lote, error: loteError } = await supabase
        .from('kit_lotes')
        .select('productos(titulo_es, slug)')
        .eq('empresa_id', empresaId)
        .eq('id', loteId)
        .maybeSingle();

      if (loteError) {
        return { success: false, error: mapPgError(loteError, 'findKitPublico', serie) };
      }
      if (!lote) {
        return { success: true, data: null };
      }

      const producto = (lote as Record<string, unknown>).productos as Record<string, unknown> | null | undefined;
      return {
        success: true,
        data: {
          loteId,
          kitNombre: (producto?.titulo_es as string) ?? '',
          kitSlug: (producto?.slug as string | null) ?? null,
        },
      };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findKitPublico', serie) };
    }
  }

  // kit-expiry-m2a (R-M2a.2.3): lee la vista `kit_lote_caducidades_efectivas`
  // (DD6) — ya calcula en SQL la fecha efectiva (propia o del albarán).
  async findCaducidadesEfectivas(empresaId: string, loteId: string): Promise<Result<Caducidad[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kit_lote_caducidades_efectivas')
        .select('ingrediente_id, consumible, parte, caduca_el')
        .eq('empresa_id', empresaId)
        .eq('lote_id', loteId);

      if (error) {
        return { success: false, error: mapPgError(error, 'findCaducidadesEfectivas') };
      }
      return { success: true, data: (data as Record<string, unknown>[]).map(mapCaducidadEfectiva) };
    } catch (e) {
      return { success: false, error: mapPgError(e as PgErrorLike, 'findCaducidadesEfectivas') };
    }
  }
}
