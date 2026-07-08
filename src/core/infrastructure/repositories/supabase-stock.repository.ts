import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { IStockRepository, FindMovimientosOpts } from '@/core/domain/repositories/IStockRepository';
import {
  Ingrediente,
  RecetaItem,
  MovimientoStock,
  Merma,
  RegistrarMermaPayload,
} from '@/core/domain/entities/stock-types';
import { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

function mapIngrediente(row: Record<string, unknown>): Ingrediente {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    nombre: row.nombre as string,
    unidad: row.unidad as Ingrediente['unidad'],
    cantidadActual: Number(row.cantidad_actual),
    umbralAlerta: Number(row.umbral_alerta),
    createdAt: row.created_at as string,
  };
}

function mapRecetaItem(row: Record<string, unknown>): RecetaItem {
  return {
    id: row.id as string,
    productoId: row.producto_id as string,
    ingredienteId: row.ingrediente_id as string,
    cantidadNecesaria: Number(row.cantidad_necesaria),
  };
}

function mapMovimiento(row: Record<string, unknown>): MovimientoStock {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    ingredienteId: (row.ingrediente_id as string) ?? null,
    tipo: row.tipo as MovimientoStock['tipo'],
    cantidad: Number(row.cantidad),
    referenciaId: (row.referencia_id as string) ?? null,
    turnoId: (row.turno_id as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapMerma(row: Record<string, unknown>): Merma {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    ingredienteId: row.ingrediente_id as string,
    cantidad: Number(row.cantidad),
    motivo: row.motivo as Merma['motivo'],
    turnoId: (row.turno_id as string) ?? null,
    operadorNombre: row.operador_nombre as string,
    notas: (row.notas as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export class SupabaseStockRepository implements IStockRepository {
  async findIngredientes(empresaId: string): Promise<Result<Ingrediente[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ingredientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nombre');

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findIngredientes') };
      }

      return { success: true, data: (data as Record<string, unknown>[]).map(mapIngrediente) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findIngredientes') };
    }
  }

  async findIngredienteById(id: string): Promise<Result<Ingrediente>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ingredientes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findIngredienteById') };
      }

      return { success: true, data: mapIngrediente(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findIngredienteById') };
    }
  }

  async createIngrediente(
    data: Omit<Ingrediente, 'id' | 'createdAt'>
  ): Promise<Result<Ingrediente>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('ingredientes')
        .insert({
          empresa_id: data.empresaId,
          nombre: data.nombre,
          unidad: data.unidad,
          cantidad_actual: data.cantidadActual,
          umbral_alerta: data.umbralAlerta,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'createIngrediente') };
      }

      return { success: true, data: mapIngrediente(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createIngrediente') };
    }
  }

  async updateIngrediente(
    id: string,
    data: Partial<Pick<Ingrediente, 'nombre' | 'unidad' | 'umbralAlerta'>>
  ): Promise<Result<Ingrediente>> {
    try {
      const supabase = getSupabaseClient();
      const patch: Record<string, unknown> = {};
      if (data.nombre !== undefined) patch.nombre = data.nombre;
      if (data.unidad !== undefined) patch.unidad = data.unidad;
      if (data.umbralAlerta !== undefined) patch.umbral_alerta = data.umbralAlerta;

      const { data: row, error } = await supabase
        .from('ingredientes')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updateIngrediente') };
      }

      return { success: true, data: mapIngrediente(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updateIngrediente') };
    }
  }

  async deleteIngrediente(id: string): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('ingredientes')
        .delete()
        .eq('id', id);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'deleteIngrediente') };
      }

      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'deleteIngrediente') };
    }
  }

  async updateCantidad(ingredienteId: string, delta: number): Promise<Result<Ingrediente>> {
    try {
      const supabase = getSupabaseClient();
      // Atomic increment/decrement via RPC — avoids read-then-write race condition.
      // The RPC returns SETOF ingredientes (array), so we take the first element.
      const { data, error } = await supabase.rpc('stock_update_cantidad', {
        p_ingrediente_id: ingredienteId,
        p_delta: delta,
      });

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'updateCantidad') };
      }

      const rows = data as Record<string, unknown>[];
      if (!rows || rows.length === 0) {
        return {
          success: false,
          error: {
            code: 'STOCK_INGREDIENTE_NOT_FOUND',
            message: `Ingrediente ${ingredienteId} no encontrado`,
            module: 'repository',
            method: 'updateCantidad',
          },
        };
      }

      return { success: true, data: mapIngrediente(rows[0]) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updateCantidad') };
    }
  }

  async findRecetaByProducto(productoId: string): Promise<Result<RecetaItem[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('receta_items')
        .select('*')
        .eq('producto_id', productoId);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findRecetaByProducto') };
      }

      return { success: true, data: (data as Record<string, unknown>[]).map(mapRecetaItem) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findRecetaByProducto') };
    }
  }

  async replaceReceta(
    productoId: string,
    items: Array<{ ingredienteId: string; cantidadNecesaria: number }>
  ): Promise<Result<RecetaItem[]>> {
    try {
      const supabase = getSupabaseClient();

      // Step 1: delete all existing recipe items for this product
      const { error: delError } = await supabase
        .from('receta_items')
        .delete()
        .eq('producto_id', productoId);

      if (delError) {
        return { success: false, error: await logger.logFromCatch(delError, 'repository', 'replaceReceta') };
      }

      // Step 2: insert new items (skip if empty)
      if (items.length === 0) {
        return { success: true, data: [] };
      }

      const rows = items.map((item) => ({
        producto_id: productoId,
        ingrediente_id: item.ingredienteId,
        cantidad_necesaria: item.cantidadNecesaria,
      }));

      const { data, error: insError } = await supabase
        .from('receta_items')
        .insert(rows)
        .select();

      if (insError) {
        return { success: false, error: await logger.logFromCatch(insError, 'repository', 'replaceReceta') };
      }

      return { success: true, data: (data as Record<string, unknown>[]).map(mapRecetaItem) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'replaceReceta') };
    }
  }

  async findMovimientos(
    empresaId: string,
    opts: FindMovimientosOpts
  ): Promise<Result<MovimientoStock[]>> {
    try {
      const supabase = getSupabaseClient();
      const { page, limit, ingredienteId, tipo, startDate, endDate } = opts;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('movimientos_stock')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (ingredienteId) query = query.eq('ingrediente_id', ingredienteId);
      if (tipo) query = query.eq('tipo', tipo);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      const { data, error } = await query;

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findMovimientos') };
      }

      return { success: true, data: (data as Record<string, unknown>[]).map(mapMovimiento) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findMovimientos') };
    }
  }

  async findMermas(empresaId: string, turnoId?: string): Promise<Result<Merma[]>> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('mermas')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (turnoId) query = query.eq('turno_id', turnoId);

      const { data, error } = await query;

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findMermas') };
      }

      return { success: true, data: (data as Record<string, unknown>[]).map(mapMerma) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findMermas') };
    }
  }

  async createMerma(payload: RegistrarMermaPayload): Promise<Result<Merma>> {
    try {
      const supabase = getSupabaseClient();

      // Step 1: Insert the merma record
      const { data: mermaRow, error: mermaError } = await supabase
        .from('mermas')
        .insert({
          empresa_id: payload.empresaId,
          ingrediente_id: payload.ingredienteId,
          cantidad: payload.cantidad,
          motivo: payload.motivo,
          turno_id: payload.turnoId,
          operador_nombre: payload.operadorNombre,
          notas: payload.notas ?? null,
        })
        .select()
        .single();

      if (mermaError) {
        return { success: false, error: await logger.logFromCatch(mermaError, 'repository', 'createMerma') };
      }

      const merma = mapMerma(mermaRow as Record<string, unknown>);

      // Step 2: Insert audit movement row
      const { error: movError } = await supabase
        .from('movimientos_stock')
        .insert({
          empresa_id: payload.empresaId,
          ingrediente_id: payload.ingredienteId,
          tipo: 'merma',
          cantidad: payload.cantidad,
          referencia_id: merma.id,
          turno_id: payload.turnoId,
        });

      if (movError) {
        return { success: false, error: await logger.logFromCatch(movError, 'repository', 'createMerma') };
      }

      // Step 3: Decrement stock quantity atomically
      const updateResult = await this.updateCantidad(payload.ingredienteId, -payload.cantidad);
      if (!updateResult.success) {
        return updateResult;
      }

      return { success: true, data: merma };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createMerma') };
    }
  }

  async createMovimiento(
    data: Omit<MovimientoStock, 'id' | 'createdAt'>
  ): Promise<Result<MovimientoStock>> {
    try {
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('movimientos_stock')
        .insert({
          empresa_id: data.empresaId,
          ingrediente_id: data.ingredienteId ?? null,
          tipo: data.tipo,
          cantidad: data.cantidad,
          referencia_id: data.referenciaId,
          turno_id: data.turnoId,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'createMovimiento') };
      }

      return { success: true, data: mapMovimiento(row as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createMovimiento') };
    }
  }

  async rehabilitarProductos(ingredienteId: string): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();

      // Step 1: get all product IDs linked to this ingredient
      const { data: recetaRows, error: recetaError } = await supabase
        .from('receta_items')
        .select('producto_id')
        .eq('ingrediente_id', ingredienteId);

      if (recetaError) {
        return { success: false, error: await logger.logFromCatch(recetaError, 'repository', 'rehabilitarProductos') };
      }

      const productoIds = (recetaRows as { producto_id: string }[]).map((r) => r.producto_id);
      if (productoIds.length === 0) return { success: true, data: undefined };

      // Step 2: re-enable the disabled ones.
      // Note: consistent with the trigger — acts only on the ingredient that changed.
      // A product with multiple low-stock ingredients may be re-enabled prematurely,
      // but the trigger will disable it again on the next deduction.
      const { error } = await supabase
        .from('productos')
        .update({ activo: true })
        .in('id', productoIds)
        .eq('activo', false);

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'rehabilitarProductos') };
      }

      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'rehabilitarProductos') };
    }
  }

  async findLowStockAlerts(empresaId: string): Promise<Result<Ingrediente[]>> {
    try {
      const supabase = getSupabaseClient();
      // supabase-js does not support column-to-column comparisons in the query builder.
      // Fetch all ingredientes with an active threshold and filter in-memory.
      const { data, error } = await supabase
        .from('ingredientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .gt('umbral_alerta', 0)
        .order('nombre');

      if (error) {
        return { success: false, error: await logger.logFromCatch(error, 'repository', 'findLowStockAlerts') };
      }

      const all = (data as Record<string, unknown>[]).map(mapIngrediente);
      const alerts = all.filter((i) => i.cantidadActual < i.umbralAlerta);
      return { success: true, data: alerts };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findLowStockAlerts') };
    }
  }
}
