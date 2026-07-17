'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { MargenProductoRow } from '@/core/domain/entities/analytics-types';

type PeriodType = 'week' | 'month' | 'custom';
type SortField = keyof Pick<
  MargenProductoRow,
  'nombre' | 'precioVentaCents' | 'costeRecetaCents' | 'margenBrutoCents' | 'margenPorcentaje' | 'unidadesVendidas' | 'contribucionTotalCents'
>;
type SortDir = 'asc' | 'desc';


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

function resolveMarginClass(margenPorcentaje: number | null, precioVentaCents: number): string {
  if (precioVentaCents === 0 || margenPorcentaje === null) return 'text-gray-400';
  if (margenPorcentaje >= 60) return 'text-green-600';
  if (margenPorcentaje >= 30) return 'text-yellow-600';
  return 'text-red-600';
}

function sortRows(rows: MargenProductoRow[], field: SortField, dir: SortDir): MargenProductoRow[] {
  return [...rows].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    return dir === 'asc' ? aNum - bNum : bNum - aNum;
  });
}

interface SortHeaderProps {
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  label: string;
  align?: 'left' | 'right';
}

function SortHeader({ field, currentField, currentDir, onSort, label, align = 'right' }: Readonly<SortHeaderProps>) {
  const isActive = currentField === field;
  const alignClass = align === 'left' ? 'text-left' : 'text-right';
  return (
    <th className={`px-4 py-3 ${alignClass} text-xs font-medium text-slate-300 uppercase`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded ${isActive ? 'text-cyan-300' : 'hover:text-white'}`}
      >
        {label}
        {isActive && currentDir === 'asc' && <ChevronUp className="w-3 h-3" />}
        {isActive && currentDir === 'desc' && <ChevronDown className="w-3 h-3" />}
        {!isActive && <ChevronDown className="w-3 h-3 opacity-30" />}
      </button>
    </th>
  );
}

export default function RentabilidadPage() {
  const { language } = useLanguage();
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [rows, setRows] = useState<MargenProductoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState<SortField>('contribucionTotalCents');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
      const res = await fetch(`/api/admin/analytics/rentabilidad?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? t('analyticsErrorLoading', language));
      }
      const json = await res.json() as MargenProductoRow[];
      setRows(json ?? []);
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

  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  const sortedRows = useMemo(
    () => sortRows(rows, sortField, sortDir),
    [rows, sortField, sortDir]
  );

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-6 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('analyticsRentabilidadTitle', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">
          {t('analyticsRentabilidadSubtitle', language)}
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
                <label htmlFor="rent-desde" className="text-xs text-slate-400 whitespace-nowrap">
                  {t('analyticsDesde', language)}
                </label>
                <input
                  id="rent-desde"
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="px-2 py-1 rounded-md border border-white/20 bg-white/5 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="rent-hasta" className="text-xs text-slate-400 whitespace-nowrap">
                  {t('analyticsHasta', language)}
                </label>
                <input
                  id="rent-hasta"
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
                {t('search', language)}
              </button>
            </>
          )}
        </div>
      </div>

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
      {!loading && rows.length > 0 && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <SortHeader
                    field="nombre"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsProduct', language)}
                    align="left"
                  />
                  <SortHeader
                    field="precioVentaCents"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsSalePrice', language)}
                  />
                  <SortHeader
                    field="costeRecetaCents"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsRecipeCost', language)}
                  />
                  <SortHeader
                    field="margenBrutoCents"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsGrossMargin', language)}
                  />
                  <SortHeader
                    field="margenPorcentaje"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsMarginPct', language)}
                  />
                  <SortHeader
                    field="unidadesVendidas"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsUnits', language)}
                  />
                  <SortHeader
                    field="contribucionTotalCents"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                    label={t('analyticsTotalContrib', language)}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedRows.map((row) => (
                  <tr key={row.productoId} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      {row.nombre}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatCents(Number(row.precioVentaCents))} €
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatCents(Number(row.costeRecetaCents))} €
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatCents(Number(row.margenBrutoCents))} €
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${resolveMarginClass(Number(row.margenPorcentaje), Number(row.precioVentaCents))}`}>
                      {Number(row.precioVentaCents) === 0 ? '—' : `${Number(row.margenPorcentaje).toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {Number(row.unidadesVendidas).toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">
                      {formatCents(Number(row.contribucionTotalCents))} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-8 text-center text-slate-400 shadow-2xl">
          {t('analyticsNoData', language)}
        </div>
      )}
    </div>
  );
}
