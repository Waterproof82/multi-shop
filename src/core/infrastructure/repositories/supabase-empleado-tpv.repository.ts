import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IEmpleadoTpvRepository, EmpleadoTpv, CreateEmpleadoTpvDto } from '@/core/domain/repositories/IEmpleadoTpvRepository';
import type { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

function mapRow(row: Record<string, unknown>): EmpleadoTpv {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    nombre: row.nombre as string,
    rol: row.rol as 'cajero' | 'encargado',
    pinHash: row.pin_hash as string,
    activo: row.activo as boolean,
    createdAt: row.created_at as string,
  };
}

export class SupabaseEmpleadoTpvRepository implements IEmpleadoTpvRepository {
  private get supabase() { return getSupabaseClient(); }

  async findActiveByPinHash(empresaId: string, pinHash: string): Promise<Result<EmpleadoTpv | null>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('pin_hash', pinHash)
        .eq('activo', true)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findActiveByPinHash') };
      return { success: true, data: data ? mapRow(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findActiveByPinHash') };
    }
  }

  async findAllByEmpresa(empresaId: string): Promise<Result<EmpleadoTpv[]>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: true });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findAllByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAllByEmpresa') };
    }
  }

  async create(dto: CreateEmpleadoTpvDto): Promise<Result<EmpleadoTpv>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .insert({ empresa_id: dto.empresaId, nombre: dto.nombre, rol: dto.rol, pin_hash: dto.pinHash })
        .select()
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'create') };
      return { success: true, data: mapRow(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'create') };
    }
  }

  async updatePin(id: string, empresaId: string, pinHash: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('empleados_tpv')
        .update({ pin_hash: pinHash })
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'updatePin') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updatePin') };
    }
  }

  async setActivo(id: string, empresaId: string, activo: boolean): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('empleados_tpv')
        .update({ activo })
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'setActivo') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'setActivo') };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      // Guard: if the employee has a labor profile (lc_perfil_laboral), a hard DELETE
      // is blocked by ON DELETE RESTRICT FK. Redirect to soft-delete (setActivo = false).
      const { data: profile, error: profileError } = await this.supabase
        .from('lc_perfil_laboral')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('empleado_id', id)
        .maybeSingle();

      if (profileError) return { success: false, error: await logger.logFromCatch(profileError, 'repository', 'delete') };

      if (profile) {
        // Soft-delete: deactivate profile + employee
        const { error: profileDeactivateError } = await this.supabase
          .from('lc_perfil_laboral')
          .update({ activo: false })
          .eq('empresa_id', empresaId)
          .eq('empleado_id', id);
        if (profileDeactivateError) return { success: false, error: await logger.logFromCatch(profileDeactivateError, 'repository', 'delete') };
        return this.setActivo(id, empresaId, false);
      }

      const { error } = await this.supabase
        .from('empleados_tpv')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'delete') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'delete') };
    }
  }

  async isActivo(id: string): Promise<Result<boolean>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .select('activo')
        .eq('id', id)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'isActivo') };
      return { success: true, data: (data as { activo: boolean } | null)?.activo ?? false };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'isActivo') };
    }
  }
}
