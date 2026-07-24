import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { PerfilLaboral } from '../domain/types';
import type { IPerfilLaboralRepository, CreatePerfilLaboralInput, UpdatePerfilLaboralInput } from '../domain/interfaces/IPerfilLaboralRepository';

function mapRow(row: Record<string, unknown>): PerfilLaboral {
  return {
    id:                   row.id as string,
    empresaId:            row.empresa_id as string,
    empleadoId:           row.empleado_id as string,
    centroId:             row.centro_id as string,
    jornadaTeoricaHoras:  Number(row.jornada_teorica_horas),
    tipoContrato:         row.tipo_contrato as PerfilLaboral['tipoContrato'],
    tiempoParcial:        row.tiempo_parcial as boolean,
    convenio:             (row.convenio as string) ?? null,
    timezone:             row.timezone as string,
    activo:               row.activo as boolean,
    createdAt:            new Date(row.created_at as string),
    updatedAt:            new Date(row.updated_at as string),
  };
}

export class SupabasePerfilLaboralRepository implements IPerfilLaboralRepository {
  private get db() { return getSupabaseClient(); }

  async create(input: CreatePerfilLaboralInput): Promise<Result<PerfilLaboral>> {
    try {
      const { data, error } = await this.db
        .from('lc_perfil_laboral')
        .insert({
          empresa_id:            input.empresaId,
          empleado_id:           input.empleadoId,
          centro_id:             input.centroId,
          jornada_teorica_horas: input.jornadaTeoricaHoras,
          tipo_contrato:         input.tipoContrato,
          tiempo_parcial:        input.tiempoParcial,
          convenio:              input.convenio ?? null,
          timezone:              input.timezone ?? 'Europe/Madrid',
        })
        .select()
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'create') };
      return { success: true, data: mapRow(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'create') };
    }
  }

  async findByEmpleado(empresaId: string, empleadoId: string): Promise<Result<PerfilLaboral | null>> {
    try {
      const { data, error } = await this.db
        .from('lc_perfil_laboral')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findByEmpleado') };
      return { success: true, data: data ? mapRow(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findByEmpleado') };
    }
  }

  async findAllByEmpresa(empresaId: string, soloActivos = true): Promise<Result<PerfilLaboral[]>> {
    try {
      let query = this.db
        .from('lc_perfil_laboral')
        .select('*')
        .eq('empresa_id', empresaId);
      if (soloActivos) query = query.eq('activo', true);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findAllByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAllByEmpresa') };
    }
  }

  async findParcialesByEmpresa(empresaId: string): Promise<Result<PerfilLaboral[]>> {
    try {
      const { data, error } = await this.db
        .from('lc_perfil_laboral')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('tiempo_parcial', true)
        .eq('activo', true);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findParcialesByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findParcialesByEmpresa') };
    }
  }

  async update(empresaId: string, empleadoId: string, input: UpdatePerfilLaboralInput): Promise<Result<PerfilLaboral>> {
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.jornadaTeoricaHoras !== undefined) patch.jornada_teorica_horas = input.jornadaTeoricaHoras;
      if (input.tipoContrato        !== undefined) patch.tipo_contrato          = input.tipoContrato;
      if (input.tiempoParcial       !== undefined) patch.tiempo_parcial         = input.tiempoParcial;
      if (input.convenio            !== undefined) patch.convenio               = input.convenio;
      if (input.timezone            !== undefined) patch.timezone               = input.timezone;
      if (input.activo              !== undefined) patch.activo                 = input.activo;

      const { data, error } = await this.db
        .from('lc_perfil_laboral')
        .update(patch)
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId)
        .select()
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'update') };
      return { success: true, data: mapRow(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'update') };
    }
  }

  async softDelete(empresaId: string, empleadoId: string): Promise<Result<void>> {
    try {
      const { error } = await this.db
        .from('lc_perfil_laboral')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'softDelete') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'softDelete') };
    }
  }
}
