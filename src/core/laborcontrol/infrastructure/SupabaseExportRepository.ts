import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { IExportRepository } from '../domain/interfaces/IExportRepository';
import type { ExportQuery, FichajeEvento, PerfilLaboral } from '../domain/types';
import type { Readable } from 'stream';
import { renderFichajesPdf } from './renderers/PdfRenderer';
import { renderFichajesExcel } from './renderers/ExcelRenderer';

function mapFichajeRow(row: Record<string, unknown>): FichajeEvento {
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

function mapPerfilRow(row: Record<string, unknown>): PerfilLaboral {
  return {
    id:                  row.id as string,
    empresaId:           row.empresa_id as string,
    empleadoId:          row.empleado_id as string,
    centroId:            row.centro_id as string,
    jornadaTeoricaHoras: Number(row.jornada_teorica_horas),
    tipoContrato:        row.tipo_contrato as PerfilLaboral['tipoContrato'],
    tiempoParcial:       row.tiempo_parcial as boolean,
    convenio:            (row.convenio as string) ?? null,
    timezone:            row.timezone as string,
    activo:              row.activo as boolean,
    createdAt:           new Date(row.created_at as string),
    updatedAt:           new Date(row.updated_at as string),
  };
}

export class SupabaseExportRepository implements IExportRepository {
  private get db() { return getSupabaseClient(); }

  async generateStream(query: ExportQuery): Promise<Result<{ stream: Readable; contentType: string; filename: string }>> {
    try {
      const dateRange = `${query.from.toISOString().slice(0, 10)}_${query.to.toISOString().slice(0, 10)}`;

      // Fetch perfiles
      let perfilQuery = this.db.from('lc_perfil_laboral').select('*').eq('empresa_id', query.empresaId);
      if (query.empleadoId) perfilQuery = perfilQuery.eq('empleado_id', query.empleadoId);
      const { data: perfiles, error: perfilError } = await perfilQuery;
      if (perfilError) return { success: false, error: await logger.logFromCatch(perfilError, 'repository', 'generateStream') };

      // Fetch fichajes for each perfil
      const exportRows = await Promise.all(
        (perfiles ?? []).map(async (p) => {
          const perfil = mapPerfilRow(p as Record<string, unknown>);
          let fichajeQuery = this.db
            .from('lc_fichajes')
            .select('*')
            .eq('empresa_id', query.empresaId)
            .eq('empleado_id', perfil.empleadoId)
            .gte('timestamp_servidor', query.from.toISOString())
            .lte('timestamp_servidor', query.to.toISOString())
            .order('timestamp_servidor', { ascending: true });
          if (!query.incluirPausas) {
            fichajeQuery = fichajeQuery.not('tipo', 'in', '(inicio_pausa,fin_pausa)');
          }
          const { data: fichajes } = await fichajeQuery;
          return { empleado: perfil, fichajes: (fichajes ?? []).map(f => mapFichajeRow(f as Record<string, unknown>)) };
        })
      );

      const empresaNombre = query.empresaId; // caller can pass name via metadata if needed

      if (query.format === 'pdf') {
        const stream = await renderFichajesPdf(exportRows, query.from, query.to, empresaNombre);
        return {
          success: true,
          data: {
            stream,
            contentType: 'application/pdf',
            filename: `fichajes_${dateRange}.pdf`,
          },
        };
      }

      const stream = await renderFichajesExcel(exportRows, query.from, query.to, empresaNombre);
      return {
        success: true,
        data: {
          stream,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: `fichajes_${dateRange}.xlsx`,
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'generateStream') };
    }
  }

  async generateResumenParcialStream(empresaId: string, year: number, month: number): Promise<Result<{ stream: Readable; contentType: string; filename: string }>> {
    try {
      const { data: perfiles, error: perfilError } = await this.db
        .from('lc_perfil_laboral')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('tiempo_parcial', true)
        .eq('activo', true);
      if (perfilError) return { success: false, error: await logger.logFromCatch(perfilError, 'repository', 'generateResumenParcialStream') };

      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 0, 23, 59, 59);

      const exportRows = await Promise.all(
        (perfiles ?? []).map(async (p) => {
          const perfil = mapPerfilRow(p as Record<string, unknown>);
          const { data: fichajes } = await this.db
            .from('lc_fichajes')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('empleado_id', perfil.empleadoId)
            .gte('timestamp_servidor', from.toISOString())
            .lte('timestamp_servidor', to.toISOString())
            .order('timestamp_servidor', { ascending: true });
          return { empleado: perfil, fichajes: (fichajes ?? []).map(f => mapFichajeRow(f as Record<string, unknown>)) };
        })
      );

      const stream = await renderFichajesPdf(exportRows, from, to, empresaId);
      return {
        success: true,
        data: {
          stream,
          contentType: 'application/pdf',
          filename: `resumen_parcial_${year}_${String(month).padStart(2, '0')}.pdf`,
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'generateResumenParcialStream') };
    }
  }
}
