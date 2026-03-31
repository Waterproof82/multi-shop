import { SupabaseClient } from '@supabase/supabase-js';
import { TgtgPromocion, TgtgItem, TgtgReserva, Result } from '@/core/domain/entities/types';
import {
  ITgtgRepository,
  CreateTgtgPromocionData,
} from '@/core/domain/repositories/ITgtgRepository';
import { logger } from '../logging/logger';

function mapPromo(row: Record<string, unknown>): TgtgPromocion {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    horaRecogidaInicio: row.hora_recogida_inicio as string,
    horaRecogidaFin: row.hora_recogida_fin as string,
    fechaActivacion: (row.fecha_activacion as string | null) ?? today,
    numeroEnvios: row.numero_envios as number,
    createdAt: row.created_at as string,
  };
}

function mapItem(row: Record<string, unknown>): TgtgItem {
  return {
    id: row.id as string,
    tgtgPromoId: row.tgtg_promo_id as string,
    empresaId: row.empresa_id as string,
    titulo: row.titulo as string,
    descripcion: (row.descripcion as string | null) ?? null,
    imagenUrl: (row.imagen_url as string | null) ?? null,
    precioOriginal: Number(row.precio_original),
    precioDescuento: Number(row.precio_descuento),
    cuponesTotal: row.cupones_total as number,
    cuponesDisponibles: row.cupones_disponibles as number,
    orden: row.orden as number,
    createdAt: row.created_at as string,
  };
}

function mapReserva(row: Record<string, unknown>): TgtgReserva {
  return {
    id: row.id as string,
    itemId: row.item_id as string,
    tgtgPromoId: row.tgtg_promo_id as string,
    empresaId: row.empresa_id as string,
    email: row.email as string,
    nombre: (row.nombre as string | null) ?? null,
    token: row.token as string,
    createdAt: row.created_at as string,
  };
}

export class SupabaseTgtgRepository implements ITgtgRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findLatestByTenant(empresaId: string): Promise<Result<TgtgPromocion | null>> {
    try {
      const { data, error } = await this.supabase
        .from('tgtg_promociones')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'TgtgRepo.findLatestByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener promo TGTG', module: 'repository' } };
      }
      return { success: true, data: data ? mapPromo(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.findLatestByTenant', { empresaId }) };
    }
  }

  async findItemsByPromo(tgtgPromoId: string): Promise<Result<TgtgItem[]>> {
    try {
      const { data, error } = await this.supabase
        .from('tgtg_items')
        .select('*')
        .eq('tgtg_promo_id', tgtgPromoId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'TgtgRepo.findItemsByPromo', { details: { tgtgPromoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener items TGTG', module: 'repository' } };
      }
      return { success: true, data: (data || []).map(r => mapItem(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.findItemsByPromo', { details: { tgtgPromoId } }) };
    }
  }

  async create(data: CreateTgtgPromocionData): Promise<Result<TgtgPromocion>> {
    try {
      const { data: promo, error: promoError } = await this.supabase
        .from('tgtg_promociones')
        .insert({
          empresa_id: data.empresaId,
          hora_recogida_inicio: data.horaRecogidaInicio,
          hora_recogida_fin: data.horaRecogidaFin,
          fecha_activacion: data.fechaActivacion,
          numero_envios: data.numeroEnvios,
        })
        .select()
        .single();

      if (promoError || !promo) {
        await logger.logAndReturnError('DB_INSERT_ERROR', promoError?.message ?? 'No data', 'repository', 'TgtgRepo.create', { empresaId: data.empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear promo TGTG', module: 'repository' } };
      }

      const promoData = promo as Record<string, unknown>;

      if (data.items.length > 0) {
        const itemsToInsert = data.items.map((item, index) => ({
          tgtg_promo_id: promoData.id as string,
          empresa_id: data.empresaId,
          titulo: item.titulo,
          descripcion: item.descripcion ?? null,
          imagen_url: item.imagenUrl ?? null,
          precio_original: item.precioOriginal,
          precio_descuento: item.precioDescuento,
          cupones_total: item.cuponesTotal,
          cupones_disponibles: item.cuponesTotal,
          orden: item.orden ?? index,
        }));

        const { error: itemsError } = await this.supabase
          .from('tgtg_items')
          .insert(itemsToInsert);

        if (itemsError) {
          await logger.logAndReturnError('DB_INSERT_ERROR', itemsError.message, 'repository', 'TgtgRepo.create.items', { details: { tgtgPromoId: promoData.id } });
          await this.supabase.from('tgtg_promociones').delete().eq('id', promoData.id);
          return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear items TGTG', module: 'repository' } };
        }
      }

      return { success: true, data: mapPromo(promoData) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.create', { empresaId: data.empresaId }) };
    }
  }

  async deleteAllByTenant(empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('tgtg_promociones')
        .delete()
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'TgtgRepo.deleteAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar promos TGTG', module: 'repository' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.deleteAllByTenant', { empresaId }) };
    }
  }

  async adjustCupones(itemId: string, delta: number): Promise<Result<TgtgItem>> {
    try {
      const { data: current, error: readErr } = await this.supabase
        .from('tgtg_items')
        .select('cupones_disponibles, cupones_total')
        .eq('id', itemId)
        .single();

      if (readErr || !current) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Item no encontrado', module: 'repository' } };
      }

      const currentData = current as Record<string, unknown>;
      const newValue = Math.max(0, Math.min(
        (currentData.cupones_disponibles as number) + delta,
        (currentData.cupones_total as number)
      ));

      const { data: updated, error: updateErr } = await this.supabase
        .from('tgtg_items')
        .update({ cupones_disponibles: newValue })
        .eq('id', itemId)
        .select()
        .single();

      if (updateErr || !updated) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', updateErr?.message ?? 'No data', 'repository', 'TgtgRepo.adjustCupones', { details: { itemId, delta } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al ajustar cupones', module: 'repository' } };
      }
      return { success: true, data: mapItem(updated as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.adjustCupones', { details: { itemId, delta } }) };
    }
  }

  async findReservasByPromo(tgtgPromoId: string, empresaId: string): Promise<Result<TgtgReserva[]>> {
    try {
      const { data, error } = await this.supabase
        .from('tgtg_reservas')
        .select('*')
        .eq('tgtg_promo_id', tgtgPromoId)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'TgtgRepo.findReservasByPromo', { empresaId, details: { tgtgPromoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener reservas', module: 'repository' } };
      }
      return { success: true, data: (data || []).map(r => mapReserva(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.findReservasByPromo', { empresaId, details: { tgtgPromoId } }) };
    }
  }

  async claimCupon(params: {
    itemId: string;
    email: string;
    nombre: string | null;
    token: string;
    tgtgPromoId: string;
    empresaId: string;
  }): Promise<Result<'ok' | 'no_cupones' | 'token_used'>> {
    try {
      const { data, error } = await this.supabase.rpc('claim_tgtg_cupon', {
        p_item_id: params.itemId,
        p_email: params.email.toLowerCase(),
        p_nombre: params.nombre,
        p_token: params.token,
        p_tgtg_promo_id: params.tgtgPromoId,
        p_empresa_id: params.empresaId,
      });

      if (error) {
        await logger.logAndReturnError('DB_RPC_ERROR', error.message, 'repository', 'TgtgRepo.claimCupon', { empresaId: params.empresaId, details: { itemId: params.itemId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al reclamar cupón', module: 'repository' } };
      }

      const rows = data as Array<{ success: boolean; message: string }>;
      const row = rows?.[0];
      if (!row) {
        return { success: false, error: { code: 'DB_ERROR', message: 'Respuesta inesperada', module: 'repository' } };
      }

      if (!row.success) {
        return { success: true, data: row.message as 'no_cupones' | 'token_used' };
      }

      return { success: true, data: 'ok' };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.claimCupon', { empresaId: params.empresaId, details: { itemId: params.itemId } }) };
    }
  }

  async findItemById(itemId: string): Promise<Result<TgtgItem | null>> {
    try {
      const { data, error } = await this.supabase
        .from('tgtg_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'TgtgRepo.findItemById', { details: { itemId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener item', module: 'repository' } };
      }
      return { success: true, data: data ? mapItem(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.findItemById', { details: { itemId } }) };
    }
  }

  async updateHoras(tgtgPromoId: string, empresaId: string, horaRecogidaInicio: string, horaRecogidaFin: string): Promise<Result<TgtgPromocion>> {
    try {
      const { data, error } = await this.supabase
        .from('tgtg_promociones')
        .update({ hora_recogida_inicio: horaRecogidaInicio, hora_recogida_fin: horaRecogidaFin })
        .eq('id', tgtgPromoId)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error || !data) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error?.message ?? 'No data', 'repository', 'TgtgRepo.updateHoras', { empresaId, details: { tgtgPromoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar horas', module: 'repository' } };
      }
      return { success: true, data: mapPromo(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.updateHoras', { empresaId, details: { tgtgPromoId } }) };
    }
  }

  async findPromoById(tgtgPromoId: string): Promise<Result<TgtgPromocion | null>> {
    try {
      const { data, error } = await this.supabase
        .from('tgtg_promociones')
        .select('*')
        .eq('id', tgtgPromoId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'TgtgRepo.findPromoById', { details: { tgtgPromoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener promo', module: 'repository' } };
      }
      return { success: true, data: data ? mapPromo(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'TgtgRepo.findPromoById', { details: { tgtgPromoId } }) };
    }
  }
}
