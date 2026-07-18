'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { OcupacionHeatmapRow } from '@/core/domain/entities/analytics-types';
import { PeriodPicker, resolveRange, type PeriodState } from '@/components/analytics/PeriodPicker';
import { HeatmapGrid } from '@/components/analytics/HeatmapGrid';

export default function OcupacionPage() {
  const { language } = useLanguage();
  const [period, setPeriod] = useState<PeriodState>({ type: 'month' });
  const [rows, setRows] = useState<OcupacionHeatmapRow[]>([]);
  const [metric, setMetric] = useState<'count' | 'duration'>('count');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (p: PeriodState) => {
    if (p.type === 'custom' && (!p.desde || !p.hasta)) return;
    const range = resolveRange(p);
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ desde: range.desde, hasta: range.hasta });
      const res = await fetch(`/api/admin/analytics/ocupacion?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? t('analyticsErrorLoading', language));
      }
      const json = await res.json() as OcupacionHeatmapRow[];
      setRows(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analyticsErrorLoading', language));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    fetchData({ type: 'month' });
  }, [fetchData]);

  function handlePeriodChange(p: PeriodState) {
    setPeriod(p);
    if (p.type !== 'custom') {
      fetchData(p);
    }
  }

  const metricBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
      active
        ? 'bg-cyan-500/30 text-white border border-cyan-400/50'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-6 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('sidebarAnalyticsOcupacion', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">Ocupación de mesas por día y hora</p>
      </div>

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl flex flex-wrap gap-4 items-center">
        <PeriodPicker
          value={period}
          onChange={handlePeriodChange}
          onFetch={() => fetchData(period)}
        />
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setMetric('count')}
            className={metricBtnClass(metric === 'count')}
          >
            Sesiones
          </button>
          <button
            type="button"
            onClick={() => setMetric('duration')}
            className={metricBtnClass(metric === 'duration')}
          >
            Duración (min)
          </button>
        </div>
      </div>

      {error !== '' && (
        <div className="p-4 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      )}

      {!loading && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
          {rows.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              {t('analyticsNoData', language)}
            </p>
          ) : (
            <HeatmapGrid rows={rows} metric={metric} />
          )}
        </div>
      )}
    </div>
  );
}
