import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import { IMesaRepository, Mesa, MesaWithSession } from '@/core/domain/repositories/IMesaRepository';
import { logger } from '../logging/logger';

export class SupabaseMesaRepository implements IMesaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(mesaId: string): Promise<Result<Mesa | null>> {
    try {
      const { data, error } = await this.supabase
        .from('mesas')
        .select('id, empresa_id, numero, nombre, created_at')
        .eq('id', mesaId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.findById',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar mesa', module: 'repository', method: 'findById' } };
      }

      if (!data) return { success: true, data: null };

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findById', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async findByEmpresa(empresaId: string): Promise<Result<Mesa[]>> {
    try {
      const { data, error } = await this.supabase
        .from('mesas')
        .select('id, empresa_id, numero, nombre, created_at')
        .eq('empresa_id', empresaId)
        .order('numero', { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.findByEmpresa',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener mesas', module: 'repository', method: 'findByEmpresa' } };
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        success: true,
        data: rows.map(row => ({
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        })),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findByEmpresa', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>> {
    try {
      const insertPayload: Record<string, unknown> = {
        empresa_id: empresaId,
        numero,
      };
      if (nombre !== undefined) {
        insertPayload['nombre'] = nombre;
      }

      const { data, error } = await this.supabase
        .from('mesas')
        .insert(insertPayload)
        .select('id, empresa_id, numero, nombre, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.create',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear mesa', module: 'repository', method: 'create' } };
      }

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.create', { empresaId });
      return { success: false, error: appError };
    }
  }

  async update(mesaId: string, empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>> {
    try {
      const updatePayload: Record<string, unknown> = { numero };
      if (nombre !== undefined) {
        updatePayload['nombre'] = nombre;
      }

      const { data, error } = await this.supabase
        .from('mesas')
        .update(updatePayload)
        .eq('id', mesaId)
        .eq('empresa_id', empresaId)
        .select('id, empresa_id, numero, nombre, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.update',
          { empresaId, details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar mesa', module: 'repository', method: 'update' } };
      }

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.update', { empresaId, details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async delete(mesaId: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('mesas')
        .delete()
        .eq('id', mesaId)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.delete',
          { empresaId, details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar mesa', module: 'repository', method: 'delete' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.delete', { empresaId, details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async findAllWithSession(empresaId: string): Promise<Result<MesaWithSession[]>> {
    try {
      // Step 1: fetch mesas (plain columns — no FK embed to avoid PostgREST join ambiguity)
      const { data: mesasData, error: mesasError } = await this.supabase
        .from('mesas')
        .select('id, empresa_id, numero, nombre, sesion_id')
        .eq('empresa_id', empresaId)
        .order('numero', { ascending: true });

      if (mesasError) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          mesasError.message,
          'repository',
          'SupabaseMesaRepository.findAllWithSession',
          { empresaId, details: { code: mesasError.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener mesas con sesión', module: 'repository', method: 'findAllWithSession' } };
      }

      const rows = (mesasData ?? []) as Record<string, unknown>[];
      const activeSesionIds = rows
        .map(r => r['sesion_id'] as string | null)
        .filter((id): id is string => id !== null);

      // Step 2: fetch session data (total, sesion_pagada, pago_en_curso) via direct query
      type SesionRow = { id: string; total: number; sesion_pagada: boolean; pago_en_curso: boolean };
      const sesionMap: Record<string, SesionRow> = {};

      if (activeSesionIds.length > 0) {
        const { data: sesionesData } = await this.supabase
          .from('mesa_sesiones')
          .select('id, total, sesion_pagada, pago_en_curso')
          .in('id', activeSesionIds);
        for (const s of (sesionesData ?? []) as SesionRow[]) {
          sesionMap[s.id] = s;
        }
      }

      // Step 3: count active (non-cerrado) pedidos per session
      const countBySesion: Record<string, number> = {};
      if (activeSesionIds.length > 0) {
        const { data: activeData } = await this.supabase
          .from('pedidos')
          .select('sesion_id')
          .in('sesion_id', activeSesionIds)
          .neq('estado', 'cerrado');
        for (const p of activeData ?? []) {
          const sid = p['sesion_id'] as string;
          countBySesion[sid] = (countBySesion[sid] ?? 0) + 1;
        }
      }

      return {
        success: true,
        data: rows.map(row => {
          const sesionId = (row['sesion_id'] as string | null) ?? null;
          const sesion = sesionId ? sesionMap[sesionId] : null;

          return {
            id: row['id'] as string,
            empresaId: row['empresa_id'] as string,
            numero: row['numero'] as number,
            nombre: (row['nombre'] as string | null) ?? null,
            sesionId,
            activeOrderCount: sesionId ? (countBySesion[sesionId] ?? 0) : 0,
            sessionTotal: sesion ? Number(sesion.total) : 0,
            sesionPagada: sesion ? (sesion.sesion_pagada ?? false) : false,
            pagoEnCurso: sesion ? (sesion.pago_en_curso ?? false) : false,
          };
        }),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findAllWithSession', { empresaId });
      return { success: false, error: appError };
    }
  }
}
