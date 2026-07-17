'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { FoodCostTeoricoRow, FoodCostRealRow } from '@/core/domain/entities/analytics-types';

type PeriodType = 'week' | 'month' | 'custom';

interface FoodCostData {
  teorico: FoodCostTeoricoRow[];
  real: FoodCostRealRow[];
  itemsSinProducto: number;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function getWeekRange(): { desde: string; hasta: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { desde: monday.toISOString(), hasta: sunday.toISOString() };
}

function getMonthRange(): { desde: string; hasta: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { desde: start.toISOString(), hasta: end.toISOString() };
}

function resolveDeviationLabel(realCents: number, theoreticalCents: number): string {
  if (theoreticalCents === 0) return '—';
  const pct = ((realCents - theoreticalCents) / theoreticalCents) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function resolveDeviationClass(realCents: number, theoreticalCents: number): string {
  if (theoreticalCents === 0) return 'text-slate-400';
  const pct = ((realCents - theoreticalCents) / theoreticalCents) * 100;
  if (pct > 10) return 'text-red-400';
  if (pct < -5) return 'text-green-400';
  return 'text-slate-300';
}

export default function FoodCostPage() {
  const { language } = useLanguage();
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [data, setData] = useState<FoodCostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resolveRange = useCallback((): { desde: string; hasta: string } | null => {
    if (period === 'week') return getWeekRange();
    if (period === 'month') return getMonthRange();
    if (!customDesde || !customHasta) return null;
    return {
      desde: new Date(customDesde).toISOString(),
      hasta: new Date(customHasta + 'T23:59:59').toISOString(),
    };
  }, [period, customDesde, customHasta]);

  const fetchData = useCallback(async () => {
    const range = resolveRange();
    if (!range) return;

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ desde: range.desde, hasta: range.hasta });
      const res = await fetch(`/api/admin/analytics/food-cost?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? t('analyticsErrorLoading', language));
      }
      const json = await res.json() as FoodCostData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analyticsErrorLoading', language));
    } finally {
      setLoading(false);
    }
  }, [resolveRange, language]);

  useEffect(() => {
    if (period !== 'custom') {
      fetchData();
    }
  }, [period, fetchData]);

  const totalRealCents = useMemo(
    () => (data?.real ?? []).reduce((sum, r) => sum + Number(r.costeTotalCents), 0),
    [data]
  );

  const totalTeoricoCents = useMemo(
    () => (data?.teorico ?? []).reduce((sum, r) => sum + Number(r.costeTotalTeoricoCents), 0),
    [data]
  );

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-6 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('analyticsFoodCostTitle', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">
          {t('analyticsFoodCostSubtitle', language)}
        </p>
      </div>

      {/* Period picker */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setPeriod('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${period === 'week' ? 'bg-cyan-500/30 text-white border border-cyan-400/50' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
          >
            {t('analyticsThisWeek', language)}
          </button>
          <button
            type="button"
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${period === 'month' ? 'bg-cyan-500/30 text-white border border-cyan-400/50' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
          >
            {t('analyticsThisMonth', language)}
          </button>
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${period === 'custom' ? 'bg-cyan-500/30 text-white border border-cyan-400/50' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
          >
            {t('analyticsCustom', language)}
          </button>

          {period === 'custom' && (
            <>
              <div className="flex items-center gap-2 ml-2">
                <label htmlFor="fc-desde" className="text-xs text-slate-400 whitespace-nowrap">
                  {t('analyticsDesde', language)}
                </label>
                <input
                  id="fc-desde"
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="px-2 py-1 rounded-md border border-white/20 bg-white/5 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="fc-hasta" className="text-xs text-slate-400 whitespace-nowrap">
                  {t('analyticsHasta', language)}
                </label>
                <input
                  id="fc-hasta"
                  type="date"
                  value={customHasta}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="px-2 py-1 rounded-md border border-white/20 bg-white/5 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                />
              </div>
              <button
                type="button"
                onClick={fetchData}
                disabled={!customDesde || !customHasta}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
              >
                {t('analyticsLoading', language).replace('...', '') || 'Buscar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {data !== null && data.itemsSinProducto > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-400/30 bg-yellow-500/10 text-yellow-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>
            {t('analyticsMissingProductsWarning', language).replace(
              '{count}',
              String(data.itemsSinProducto)
            )}
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      )}

      {/* Table */}
      {!loading && data !== null && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          {data.teorico.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {t('analyticsNoData', language)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      {t('analyticsProduct', language)}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                      {t('analyticsUnitsSold', language)}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                      {t('analyticsTheoreticalCost', language)}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                      {t('analyticsRealCost', language)}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                      {t('analyticsDeviation', language)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.teorico.map((row) => {
                    const theoreticalCents = Number(row.costeTotalTeoricoCents);
                    return (
                      <tr key={row.productoId} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {row.nombreProducto}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {Number(row.unidadesVendidas).toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {formatCents(theoreticalCents)} €
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {formatCents(totalRealCents)} €
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${resolveDeviationClass(totalRealCents, theoreticalCents)}`}>
                          {resolveDeviationLabel(totalRealCents, theoreticalCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-white/20 bg-white/5">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-white" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-white text-right">
                      {formatCents(totalTeoricoCents)} €
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-white text-right">
                      {formatCents(totalRealCents)} €
                    </td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${resolveDeviationClass(totalRealCents, totalTeoricoCents)}`}>
                      {resolveDeviationLabel(totalRealCents, totalTeoricoCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer footer */}
      {!loading && data !== null && (
        <p className="text-xs text-slate-500 px-1">
          {t('analyticsDisclaimer', language)}
        </p>
      )}
    </div>
  );
}
