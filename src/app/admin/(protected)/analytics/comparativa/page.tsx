'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { DeltaKpi } from '@/core/domain/entities/analytics-types';
import { DeltaCard } from '@/components/analytics/DeltaCard';

type ComparisonMode = 'semana' | 'mes';

interface PeriodBounds {
  desdeA: string;
  hastaA: string;
  desdeB: string;
  hastaB: string;
}

function resolvePeriodBoundsForMode(mode: ComparisonMode): PeriodBounds {
  const now = new Date();
  if (mode === 'semana') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const thisMonday = new Date(now);
    thisMonday.setDate(diff);
    thisMonday.setHours(0, 0, 0, 0);
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisMonday.getDate() + 7);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    const prevSunday = new Date(thisMonday);
    return {
      desdeA: thisMonday.toISOString(),
      hastaA: thisSunday.toISOString(),
      desdeB: prevMonday.toISOString(),
      hastaB: prevSunday.toISOString(),
    };
  }
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    desdeA: thisStart.toISOString(),
    hastaA: thisEnd.toISOString(),
    desdeB: prevStart.toISOString(),
    hastaB: prevEnd.toISOString(),
  };
}

export default function ComparativaPage() {
  const { language } = useLanguage();
  const [mode, setMode] = useState<ComparisonMode>('semana');
  const [deltaKpis, setDeltaKpis] = useState<DeltaKpi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (m: ComparisonMode) => {
    const bounds = resolvePeriodBoundsForMode(m);
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(bounds as unknown as Record<string, string>);
      const res = await fetch(`/api/admin/analytics/comparativa?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? t('analyticsErrorLoading', language));
      }
      const json = await res.json() as DeltaKpi[];
      setDeltaKpis(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analyticsErrorLoading', language));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    fetchData('semana');
  }, [fetchData]);

  function handleModeChange(m: ComparisonMode) {
    setMode(m);
    fetchData(m);
  }

  const modeBtnClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
      active
        ? 'bg-cyan-500/30 text-white border border-cyan-400/50'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-6 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('sidebarAnalyticsComparativa', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">Comparativa de períodos</p>
      </div>

      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('semana')}
            className={modeBtnClass(mode === 'semana')}
          >
            Semana actual vs. anterior
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('mes')}
            className={modeBtnClass(mode === 'mes')}
          >
            Mes actual vs. anterior
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

      {!loading && deltaKpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {deltaKpis.map((kpi) => (
            <DeltaCard key={kpi.label} kpi={kpi} />
          ))}
        </div>
      )}

      {!loading && deltaKpis.length === 0 && error === '' && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-8 text-center text-slate-400">
          {t('analyticsNoData', language)}
        </div>
      )}
    </div>
  );
}
