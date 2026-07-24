import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { ChainAnchor, ChainVerifyResult } from '../domain/types';
import type { IChainRepository } from '../domain/interfaces/IChainRepository';

function mapAnchorRow(row: Record<string, unknown>): ChainAnchor {
  return {
    id:           row.id as string,
    empresaId:    row.empresa_id as string,
    segmentYear:  row.segment_year as number,
    segmentMonth: row.segment_month as number,
    finalHash:    row.final_hash as string,
    recordCount:  Number(row.record_count),
    sealedAt:     new Date(row.sealed_at as string),
    sealedBy:     row.sealed_by as string,
  };
}

export class SupabaseChainRepository implements IChainRepository {
  private get db() { return getSupabaseClient(); }

  async sealMonthAnchors(year: number, month: number): Promise<Result<ChainAnchor[]>> {
    try {
      const { data, error } = await this.db
        .rpc('lc_seal_month_anchors', { p_year: year, p_month: month });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'sealMonthAnchors') };
      // RPC returns rows directly; re-query to get full anchor rows
      const { data: anchors, error: anchorError } = await this.db
        .from('lc_chain_anchors')
        .select('*')
        .eq('segment_year', year)
        .eq('segment_month', month);
      if (anchorError) return { success: false, error: await logger.logFromCatch(anchorError, 'repository', 'sealMonthAnchors') };
      void data; // RPC result not needed — we re-query for full rows
      return { success: true, data: (anchors ?? []).map(r => mapAnchorRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'sealMonthAnchors') };
    }
  }

  async verifySegment(empresaId: string, year: number, month: number): Promise<Result<ChainVerifyResult>> {
    try {
      const { data, error } = await this.db
        .rpc('lc_verify_chain_segment', { p_empresa_id: empresaId, p_year: year, p_month: month })
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'verifySegment') };
      const row = data as Record<string, unknown>;
      const status = (row.status as string).toLowerCase() as ChainVerifyResult['status'];
      return {
        success: true,
        data: {
          segment:    `${year}-${String(month).padStart(2, '0')}`,
          status:     status === 'ok' || status === 'broken' || status === 'tampered' ? status : 'empty',
          totalRows:  Number(row.total_rows ?? 0),
          brokenAt:   row.broken_at != null ? Number(row.broken_at) : null,
          message:    row.message as string,
          verifiedAt: new Date(),
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'verifySegment') };
    }
  }

  async findAnchor(empresaId: string, year: number, month: number): Promise<Result<ChainAnchor | null>> {
    try {
      const { data, error } = await this.db
        .from('lc_chain_anchors')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('segment_year', year)
        .eq('segment_month', month)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findAnchor') };
      return { success: true, data: data ? mapAnchorRow(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAnchor') };
    }
  }

  async createNextPartition(): Promise<Result<string>> {
    try {
      const { data, error } = await this.db
        .rpc('lc_create_next_partition')
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'createNextPartition') };
      return { success: true, data: data as string };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'createNextPartition') };
    }
  }

  async dropExpiredPartition(partitionName: string): Promise<Result<string>> {
    try {
      const { data, error } = await this.db
        .rpc('lc_drop_expired_partition', { p_name: partitionName })
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'dropExpiredPartition') };
      return { success: true, data: data as string };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'dropExpiredPartition') };
    }
  }
}
