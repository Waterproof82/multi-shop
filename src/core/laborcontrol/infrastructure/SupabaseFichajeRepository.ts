import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { FichajeEvento, Correccion } from '../domain/types';
import type { IFichajeRepository, RegistrarFichajeInput } from '../domain/interfaces/IFichajeRepository';

function mapRow(row: Record<string, unknown>): FichajeEvento {
  return {
    recordId:          row.record_id as string,
    chainSeq:          row.chain_seq as number,
    empresaId:         row.empresa_id as string,
    centroId:          row.centro_id as string,
    empleadoId:        row.empleado_id as string,
    actorId:           row.actor_id as string,
    tipo:              row.tipo as FichajeEvento['tipo'],
    accion:            (row.accion as FichajeEvento['accion']) ?? null,
    refCorreccion:     (row.ref_correccion as string) ?? null,
    timestampEvento:   new Date(row.timestamp_evento as string),
    timestampServidor: new Date(row.timestamp_servidor as string),
    origenOffline:     row.origen_offline as boolean,
    motivo:            (row.motivo as string) ?? null,
    chainHash:         row.chain_hash as string,
    prevHash:          row.prev_hash as string,
    createdAt:         new Date(row.created_at as string),
  };
}

export class SupabaseFichajeRepository implements IFichajeRepository {
  private get db() { return getSupabaseClient(); }

  async registrar(input: RegistrarFichajeInput): Promise<Result<Pick<FichajeEvento, 'recordId' | 'chainHash' | 'timestampServidor'>>> {
    try {
      const { data, error } = await this.db
        .from('lc_fichajes')
        .insert({
          empresa_id:       input.empresaId,
          centro_id:        input.centroId,
          empleado_id:      input.empleadoId,
          actor_id:         input.actorId,
          tipo:             input.tipo,
          timestamp_evento: input.timestampEvento.toISOString(),
          origen_offline:   input.origenOffline,
          motivo:           input.motivo ?? null,
          // Placeholders — BEFORE INSERT trigger overwrites these
          chain_hash: 'PENDING',
          prev_hash:  'PENDING',
        })
        .select('record_id, chain_hash, timestamp_servidor')
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'registrar') };
      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          recordId:          row.record_id as string,
          chainHash:         row.chain_hash as string,
          timestampServidor: new Date(row.timestamp_servidor as string),
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'registrar') };
    }
  }

  async registrarCorreccion(c: Correccion): Promise<Result<Pick<FichajeEvento, 'recordId' | 'chainHash'>>> {
    try {
      const { data, error } = await this.db
        .from('lc_fichajes')
        .insert({
          empresa_id:       c.empresaId,
          centro_id:        c.centroId,
          empleado_id:      c.empleadoId,
          actor_id:         c.actorId,
          tipo:             'correccion',
          accion:           c.accion,
          ref_correccion:   c.refCorreccion,
          timestamp_evento: c.timestampEvento.toISOString(),
          origen_offline:   c.origenOffline,
          motivo:           c.motivo,
          chain_hash: 'PENDING',
          prev_hash:  'PENDING',
        })
        .select('record_id, chain_hash')
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'registrarCorreccion') };
      const row = data as Record<string, unknown>;
      return { success: true, data: { recordId: row.record_id as string, chainHash: row.chain_hash as string } };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'registrarCorreccion') };
    }
  }

  async findByEmpleado(
    empresaId: string,
    empleadoId: string,
    from: Date,
    to: Date,
    includeCorrecciones = true,
  ): Promise<Result<FichajeEvento[]>> {
    try {
      let query = this.db
        .from('lc_fichajes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId)
        .gte('timestamp_servidor', from.toISOString())
        .lte('timestamp_servidor', to.toISOString())
        .order('timestamp_servidor', { ascending: true });

      if (!includeCorrecciones) {
        query = query.neq('tipo', 'correccion');
      }

      const { data, error } = await query;
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findByEmpleado') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findByEmpleado') };
    }
  }

  async findUltimoByEmpleado(empresaId: string, empleadoId: string): Promise<Result<FichajeEvento | null>> {
    try {
      const { data, error } = await this.db
        .from('lc_fichajes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId)
        .neq('tipo', 'correccion')
        .order('chain_seq', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findUltimoByEmpleado') };
      return { success: true, data: data ? mapRow(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findUltimoByEmpleado') };
    }
  }

  async findByEmpresa(empresaId: string, from: Date, to: Date): Promise<Result<FichajeEvento[]>> {
    try {
      const { data, error } = await this.db
        .from('lc_fichajes')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('timestamp_servidor', from.toISOString())
        .lte('timestamp_servidor', to.toISOString())
        .order('timestamp_servidor', { ascending: true });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findByEmpresa') };
    }
  }

  async existePerfilLaboral(empresaId: string, empleadoId: string): Promise<Result<boolean>> {
    try {
      const { data, error } = await this.db
        .from('lc_perfil_laboral')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'existePerfilLaboral') };
      return { success: true, data: data !== null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'existePerfilLaboral') };
    }
  }
}
