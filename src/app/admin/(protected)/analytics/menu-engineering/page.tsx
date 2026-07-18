'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { MargenProductoRow, BcgItem, BcgQuadrant } from '@/core/domain/entities/analytics-types';
import { PeriodPicker, resolveRange, type PeriodState } from '@/components/analytics/PeriodPicker';
import { BcgScatterChart } from '@/components/analytics/BcgScatterChart';

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function resolveQuadrant(
  margen: number,
  unidades: number,
  medianMargen: number,
  medianUnidades: number
): BcgQuadrant {
  const highMargen = margen >= medianMargen;
  const highUnidades = unidades >= medianUnidades;
  if (highMargen && highUnidades) return 'star';
  if (!highMargen && highUnidades) return 'plow';
  if (highMargen && !highUnidades) return 'question';
  return 'dog';
}

function classifyBcg(items: MargenProductoRow[]): {
  bcgItems: BcgItem[];
  medianMargen: number;
  medianUnidades: number;
} {
  if (items.length === 0) {
    return { bcgItems: [], medianMargen: 0, medianUnidades: 0 };
  }
  const medianMargen = computeMedian(items.map((i) => i.margenPorcentaje));
  const medianUnidades = computeMedian(items.map((i) => i.unidadesVendidas));
  const bcgItems: BcgItem[] = items.map((item) => ({
    ...item,
    quadrant: resolveQuadrant(
      item.margenPorcentaje,
      item.unidadesVendidas,
      medianMargen,
      medianUnidades
    ),
  }));
  return { bcgItems, medianMargen, medianUnidades };
}

export default function MenuEngineeringPage() {
  const { language } = useLanguage();
  const [period, setPeriod] = useState<PeriodState>({ type: 'month' });
  const [items, setItems] = useState<MargenProductoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (p: PeriodState) => {
    if (p.type === 'custom' && (!p.desde || !p.hasta)) return;
    const range = resolveRange(p);
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ desde: range.desde, hasta: range.hasta });
      const res = await fetch(`/api/admin/analytics/rentabilidad?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? t('analyticsErrorLoading', language));
      }
      const json = await res.json() as { items: MargenProductoRow[] };
      setItems(json.items ?? []);
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

  const { bcgItems, medianMargen, medianUnidades } = classifyBcg(items);

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-6 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('sidebarAnalyticsMenuEngineering', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">Matriz BCG de ingeniería de menú</p>
      </div>

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
        <PeriodPicker
          value={period}
          onChange={handlePeriodChange}
          onFetch={() => fetchData(period)}
        />
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
          <BcgScatterChart
            items={bcgItems}
            medianUnidades={medianUnidades}
            medianMargen={medianMargen}
          />
        </div>
      )}
    </div>
  );
}
