'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { MovimientoStock, TipoMovimiento, Ingrediente } from '@/core/domain/entities/stock-types';

interface MovimientosResponse {
  items: MovimientoStock[];
  total: number;
  page: number;
  limit: number;
}

interface FiltersState {
  ingredienteId: string;
  tipo: string;
  startDate: string;
  endDate: string;
}

const TIPOS: TipoMovimiento[] = ['entrada', 'deduccion', 'ajuste', 'merma', 'sin_receta'];

const TIPO_COLORS: Record<TipoMovimiento, string> = {
  entrada: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300',
  deduccion: 'bg-blue-500/20 border-blue-400/30 text-blue-300',
  ajuste: 'bg-yellow-500/20 border-yellow-400/30 text-yellow-300',
  merma: 'bg-red-500/20 border-red-400/30 text-red-300',
  sin_receta: 'bg-slate-500/20 border-slate-400/30 text-slate-300',
};

function TipoBadge({ tipo }: Readonly<{ tipo: TipoMovimiento }>) {
  const colorClass = TIPO_COLORS[tipo] ?? 'bg-slate-500/20 border-slate-400/30 text-slate-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${colorClass}`}>
      {tipo}
    </span>
  );
}

function buildQueryString(page: number, limit: number, filters: FiltersState): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters.ingredienteId) params.set('ingredienteId', filters.ingredienteId);
  if (filters.tipo) params.set('tipo', filters.tipo);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  return params.toString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LIMIT = 20;

export default function MovimientosPage() {
  const { language } = useLanguage();
  const [data, setData] = useState<MovimientosResponse | null>(null);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FiltersState>({
    ingredienteId: '',
    tipo: '',
    startDate: '',
    endDate: '',
  });

  const fetchData = useCallback(async (currentPage: number, currentFilters: FiltersState) => {
    setLoading(true);
    setError('');
    try {
      const qs = buildQueryString(currentPage, LIMIT, currentFilters);
      const res = await fetch(`/api/admin/stock/movimientos?${qs}`);
      if (!res.ok) throw new Error('Error al cargar movimientos');
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIngredientes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stock/ingredientes');
      if (!res.ok) return;
      const result = await res.json();
      setIngredientes(result);
    } catch {
      // Non-critical: filter dropdown still renders without names
    }
  }, []);

  useEffect(() => {
    fetchIngredientes();
  }, [fetchIngredientes]);

  useEffect(() => {
    fetchData(page, filters);
  }, [fetchData, page, filters]);

  const handleFilterChange = (key: keyof FiltersState, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handlePrev = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNext = () => {
    if (data && page * LIMIT < data.total) setPage(page + 1);
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  function getIngredienteNombre(id: string | null): string {
    if (!id) return '—';
    return ingredientes.find((i) => i.id === id)?.nombre ?? id.slice(0, 8);
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {t('stockMovimientosTitle', language)}
        </h1>
        <p className="text-slate-300 text-sm mt-1">
          {t('stockMovimientosSubtitle', language)}
        </p>
      </div>

      {/* Filters */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="filter-ingrediente" className="block text-xs font-medium text-slate-300 mb-1">
              {t('stockFiltrarIngrediente', language)}
            </label>
            <select
              id="filter-ingrediente"
              value={filters.ingredienteId}
              onChange={(e) => handleFilterChange('ingredienteId', e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors cursor-pointer"
              aria-label={t('stockFiltrarIngrediente', language)}
            >
              <option value="">Todos</option>
              {ingredientes.map((ing) => (
                <option key={ing.id} value={ing.id}>{ing.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-tipo" className="block text-xs font-medium text-slate-300 mb-1">
              {t('stockFiltrarTipo', language)}
            </label>
            <select
              id="filter-tipo"
              value={filters.tipo}
              onChange={(e) => handleFilterChange('tipo', e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors cursor-pointer"
              aria-label={t('stockFiltrarTipo', language)}
            >
              <option value="">Todos</option>
              {TIPOS.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-desde" className="block text-xs font-medium text-slate-300 mb-1">
              {t('stockFechaDesde', language)}
            </label>
            <input
              id="filter-desde"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
              aria-label={t('stockFechaDesde', language)}
            />
          </div>

          <div>
            <label htmlFor="filter-hasta" className="block text-xs font-medium text-slate-300 mb-1">
              {t('stockFechaHasta', language)}
            </label>
            <input
              id="filter-hasta"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
              aria-label={t('stockFechaHasta', language)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      {t('stockFecha', language)}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      {t('stockTipo', language)}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      {t('stockIngredienteNombre', language)}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      {t('stockCantidadMovimiento', language)}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                      {t('stockTurno', language)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data?.items.map((mov) => (
                    <tr key={mov.id} className="hover:bg-white/5 transition-colors border-b border-white/10">
                      <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                        {formatDate(mov.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <TipoBadge tipo={mov.tipo} />
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {getIngredienteNombre(mov.ingredienteId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {mov.cantidad}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {mov.turnoId ? mov.turnoId.slice(0, 8) : '—'}
                      </td>
                    </tr>
                  ))}
                  {(!data?.items.length) && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        {t('stockSinMovimientos', language)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/10">
              {data?.items.map((mov) => (
                <div key={mov.id} className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {getIngredienteNombre(mov.ingredienteId)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(mov.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <TipoBadge tipo={mov.tipo} />
                      <span className="text-sm text-slate-300">{mov.cantidad}</span>
                    </div>
                  </div>
                </div>
              ))}
              {(!data?.items.length) && (
                <div className="p-8 text-center text-slate-400">
                  {t('stockSinMovimientos', language)}
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm text-slate-400">
                {data ? `${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, data.total)} de ${data.total}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={page <= 1}
                  aria-label={t('stockAnterior', language)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('stockAnterior', language)}</span>
                </Button>
                <span className="text-sm text-slate-300">{page} / {totalPages}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={!data || page * LIMIT >= data.total}
                  aria-label={t('stockSiguiente', language)}
                >
                  <span className="hidden sm:inline">{t('stockSiguiente', language)}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
