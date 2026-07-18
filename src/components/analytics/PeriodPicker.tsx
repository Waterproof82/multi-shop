'use client';

import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

export type PeriodState =
  | { type: 'week' | 'month' }
  | { type: 'custom'; desde: string; hasta: string };

interface PeriodPickerProps {
  value: PeriodState;
  onChange: (state: PeriodState) => void;
  onFetch?: () => void;
}

export function resolveRange(state: PeriodState): { desde: string; hasta: string } {
  if (state.type === 'week') {
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
  if (state.type === 'month') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { desde: start.toISOString(), hasta: end.toISOString() };
  }
  // state.type === 'custom' here — narrowed by above early returns
  const custom = state as { type: 'custom'; desde: string; hasta: string };
  return {
    desde: new Date(custom.desde).toISOString(),
    hasta: new Date(custom.hasta + 'T23:59:59').toISOString(),
  };
}

export function PeriodPicker({ value, onChange, onFetch }: Readonly<PeriodPickerProps>) {
  const { language } = useLanguage();

  const btnClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
      active
        ? 'bg-cyan-500/30 text-white border border-cyan-400/50'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const isCustom = value.type === 'custom';
  const customDesde = isCustom ? value.desde : '';
  const customHasta = isCustom ? value.hasta : '';

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        type="button"
        onClick={() => onChange({ type: 'week' })}
        className={btnClass(value.type === 'week')}
      >
        {t('analyticsThisWeek', language)}
      </button>
      <button
        type="button"
        onClick={() => onChange({ type: 'month' })}
        className={btnClass(value.type === 'month')}
      >
        {t('analyticsThisMonth', language)}
      </button>
      <button
        type="button"
        onClick={() => onChange({ type: 'custom', desde: '', hasta: '' })}
        className={btnClass(isCustom)}
      >
        {t('analyticsCustom', language)}
      </button>

      {isCustom && (
        <>
          <div className="flex items-center gap-2 ml-2">
            <label htmlFor="pp-desde" className="text-xs text-slate-400 whitespace-nowrap">
              {t('analyticsDesde', language)}
            </label>
            <input
              id="pp-desde"
              type="date"
              value={customDesde}
              onChange={(e) =>
                onChange({ type: 'custom', desde: e.target.value, hasta: customHasta })
              }
              className="px-2 py-1 rounded-md border border-white/20 bg-white/5 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="pp-hasta" className="text-xs text-slate-400 whitespace-nowrap">
              {t('analyticsHasta', language)}
            </label>
            <input
              id="pp-hasta"
              type="date"
              value={customHasta}
              onChange={(e) =>
                onChange({ type: 'custom', desde: customDesde, hasta: e.target.value })
              }
              className="px-2 py-1 rounded-md border border-white/20 bg-white/5 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            />
          </div>
          {onFetch !== undefined && (
            <button
              type="button"
              onClick={onFetch}
              disabled={!customDesde || !customHasta}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              {t('search', language)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
