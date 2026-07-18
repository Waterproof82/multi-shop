'use client';

import type { DeltaKpi } from '@/core/domain/entities/analytics-types';

interface DeltaCardProps {
  kpi: DeltaKpi;
}

type DeltaClass = 'positive' | 'negative' | 'neutral';

function resolveDeltaClass(kpi: DeltaKpi): DeltaClass {
  if (kpi.deltaPercent === null || kpi.deltaPercent === 0) return 'neutral';
  return kpi.deltaPercent > 0 ? 'positive' : 'negative';
}

function formatDelta(kpi: DeltaKpi): string {
  if (kpi.deltaPercent === null) return 'N/A';
  const sign = kpi.deltaPercent > 0 ? '+' : '';
  return `${sign}${kpi.deltaPercent.toFixed(1)} %`;
}

function formatValue(label: string, cents: number): string {
  if (label === 'Margen %' || label === 'Covers') {
    return String(cents);
  }
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

const DELTA_COLOR: Record<DeltaClass, string> = {
  positive: 'text-green-400',
  negative: 'text-red-400',
  neutral: 'text-slate-400',
};

const DELTA_BG: Record<DeltaClass, string> = {
  positive: 'bg-green-500/10 border-green-400/30',
  negative: 'bg-red-500/10 border-red-400/30',
  neutral: 'bg-slate-700/10 border-slate-600/30',
};

export function DeltaCard({ kpi }: Readonly<DeltaCardProps>) {
  const cls = resolveDeltaClass(kpi);

  return (
    <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-5 flex flex-col gap-2">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
      <p className="text-2xl font-bold text-white">{formatValue(kpi.label, kpi.currentCents)}</p>
      <p className="text-xs text-slate-500">
        Anterior: {formatValue(kpi.label, kpi.previousCents)}
      </p>
      <span
        className={`self-start px-2 py-0.5 rounded-md text-sm font-semibold border ${DELTA_BG[cls]} ${DELTA_COLOR[cls]}`}
      >
        {formatDelta(kpi)}
      </span>
    </div>
  );
}
