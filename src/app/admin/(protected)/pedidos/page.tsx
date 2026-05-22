'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Search, ChevronDown, ChevronUp, Check, Clock, Trash2, ShoppingCart, Calendar, Trash, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { PedidoItem, PedidoComplemento } from '@/core/domain/entities/types';
import { PEDIDO_ESTADO_COLORS, ESTADOS_POR_ORIGEN, getOrigenPedido, type PedidoEstado } from '@/core/domain/constants/pedido';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { formatPrice } from '@/lib/format-price';
import { logClientError } from '@/lib/client-error';
import { useLanguage, type Language } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import { SkeletonTable, SkeletonStats, Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format-date';

interface Cliente {
  nombre: string | null;
  email: string | null;
  telefono: string | null;
}

interface MesaInfo {
  numero: number;
  nombre: string | null;
}

interface Pedido {
  id: string;
  numero_pedido: number;
  cliente_id: string | null;
  clientes: Cliente | null;
  total: number;
  moneda: string;
  detalle_pedido: PedidoItem[];
  estado: string;
  created_at: string;
  mesa_id: string | null;
  tracking_token: string | null;
  mesas: MesaInfo | null;
}

const ORIGEN_ORDER: Record<string, number> = { mesa: 0, recogida: 1, web: 2 };

function getDeleteConfirmationText(language: string): string {
  const confirmationTexts: Record<string, string> = {
    es: 'ELIMINAR',
    en: 'DELETE',
    fr: 'SUPPRIMER',
    it: 'ELIMINA',
    de: 'LÖSCHEN'
  };
  return confirmationTexts[language] || 'DELETE';
}

function getDeletingText(language: string): string {
  const deletingTexts: Record<string, string> = {
    es: 'Eliminando...',
    en: 'Deleting...',
    fr: 'Suppression...',
    it: 'Eliminazione...',
    de: 'Wird gelöscht...'
  };
  return deletingTexts[language] || 'Deleting...';
}

function getAriaSortValue(sortField: string, currentField: string, sortDirection: 'asc' | 'desc') {
  if (sortField === currentField) {
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }
  return 'none';
}

const ESTADO_TRANSLATION_KEYS: Partial<Record<PedidoEstado, keyof typeof import('@/lib/translations').translations.es>> = {
  pendiente:  'statusPendiente',
  anotado:    'statusAnotado',
  servido:    'statusServido',
  aceptado:   'statusAceptado',
  preparando: 'statusPreparando',
  listo:      'statusListo',
  enviado:    'statusEnviado',
  entregado:  'statusEntregado',
  cancelado:  'statusCancelado',
};

function shiftMonth(current: { mes: number; año: number }, delta: number) {
  const nuevoMes = current.mes + delta;
  const nuevoAño = current.año + Math.floor(nuevoMes / 12);
  return { mes: ((nuevoMes % 12) + 12) % 12, año: nuevoAño };
}

function comparePedidos(a: Pedido, b: Pedido, sortField: keyof Pedido | 'origen', sortDirection: 'asc' | 'desc'): number {
  if (sortField === 'origen') {
    const aOrd = ORIGEN_ORDER[getOrigenPedido(a.mesa_id, a.tracking_token)];
    const bOrd = ORIGEN_ORDER[getOrigenPedido(b.mesa_id, b.tracking_token)];
    return sortDirection === 'asc' ? aOrd - bOrd : bOrd - aOrd;
  }
  const aVal = a[sortField];
  const bVal = b[sortField];
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;
  if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
  if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
  return 0;
}

function renderOrigenBadge(pedido: Pedido) {
  if (pedido.mesa_id) {
    const label = pedido.mesas ? `Mesa ${pedido.mesas.numero}` : 'Mesa';
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30">
        {label}
      </span>
    );
  }
  if (pedido.tracking_token) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
        Recogida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30">
      Web
    </span>
  );
}

function renderEstadoBadge(
  pedido: Pedido,
  language: Parameters<typeof t>[1],
  onUpdate: (id: string, estado: string) => void,
) {
  const origen = getOrigenPedido(pedido.mesa_id, pedido.tracking_token);
  const flow = ESTADOS_POR_ORIGEN[origen];
  const estado = pedido.estado as PedidoEstado;
  const currentIdx = flow.indexOf(estado);

  let siguienteEstado: string;
  if (estado === 'cancelado' || currentIdx === -1) {
    siguienteEstado = 'pendiente';
  } else if (currentIdx < flow.length - 1) {
    siguienteEstado = flow[currentIdx + 1];
  } else {
    siguienteEstado = flow[0];
  }

  const translationKey = ESTADO_TRANSLATION_KEYS[estado];
  const label = translationKey ? t(translationKey, language) : estado;
  const isPending = estado === 'pendiente' || estado === 'cancelado';

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onUpdate(pedido.id, siguienteEstado); }}
      aria-label={`${label} — ${t('edit', language)}`}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        PEDIDO_ESTADO_COLORS[estado] || 'bg-muted text-foreground hover:bg-muted/80'
      }`}
    >
      {isPending ? <Clock className="w-3 h-3" /> : <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}

function handleFetchError(error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  logClientError(error, 'fetchPedidos');
}

function nextSortState(
  field: keyof Pedido | 'origen',
  currentField: keyof Pedido | 'origen',
  currentDirection: 'asc' | 'desc',
): { field: keyof Pedido | 'origen'; direction: 'asc' | 'desc' } {
  if (currentField === field) return { field, direction: currentDirection === 'asc' ? 'desc' : 'asc' };
  return { field, direction: 'asc' };
}

function matchesPedido(p: Pedido, rawTerm: string, lowerTerm: string): boolean {
  return (
    p.numero_pedido.toString().includes(rawTerm) ||
    (p.clientes?.nombre?.toLowerCase().includes(lowerTerm) ?? false) ||
    (p.clientes?.telefono?.includes(rawTerm) ?? false) ||
    (p.clientes?.email?.toLowerCase().includes(lowerTerm) ?? false)
  );
}

async function loadPedidos(
  effectiveEmpresaId: string,
  selectedMonth: { mes: number; año: number },
  signal: AbortSignal,
): Promise<Pedido[]> {
  const url = `/api/admin/pedidos?empresaId=${effectiveEmpresaId}&mes=${selectedMonth.mes}&año=${selectedMonth.año}`;
  const res = await fetchWithCsrf(url, { signal }, {
    maxRetries: 3,
    baseDelay: 1000,
    retryOn: (response) => response.status >= 500 || response.status === 429 || response.status === 408,
  });
  if (!res.ok) return [];
  const data = await res.json() as { pedidos?: Pedido[] };
  return data.pedidos ?? [];
}

function computePedidoStats(pedidos: Pedido[], selectedMonth: { mes: number; año: number }) {
  const today = new Date();
  const selectedMonthStart = new Date(selectedMonth.año, selectedMonth.mes, 1);
  const selectedMonthEnd = new Date(selectedMonth.año, selectedMonth.mes + 1, 0, 23, 59, 59);
  const isCurrentMonth = selectedMonth.mes === today.getMonth() && selectedMonth.año === today.getFullYear();

  let pedidosHoy: Pedido[] = [];
  let pedidosDelMes: Pedido[];

  if (isCurrentMonth) {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    pedidosHoy = pedidos.filter(p => new Date(p.created_at) >= todayStart);
    pedidosDelMes = pedidos.filter(p => new Date(p.created_at) >= selectedMonthStart);
  } else {
    pedidosDelMes = pedidos.filter(p => {
      const created = new Date(p.created_at);
      return created >= selectedMonthStart && created <= selectedMonthEnd;
    });
  }

  const IN_PROGRESS = new Set(['aceptado', 'preparando', 'enviado', 'entregado']);
  return {
    pedidosHoy: pedidosHoy.length,
    totalHoy: pedidosHoy.reduce((sum, p) => sum + p.total, 0),
    pedidosMes: pedidosDelMes.length,
    totalMes: pedidosDelMes.reduce((sum, p) => sum + p.total, 0),
    pendientes: pedidosDelMes.filter(p => p.estado === 'pendiente').length,
    aceptados: pedidosDelMes.filter(p => IN_PROGRESS.has(p.estado)).length,
    isCurrentMonth,
  };
}

function StatsSection({
  stats,
  language,
}: Readonly<{
  stats: ReturnType<typeof computePedidoStats>;
  language: Language;
}>) {
  return (
    <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{t("ordersTitle", language)}</h1>
          <p className="text-slate-300 text-sm mt-1">{t("ordersSubtitle", language)}</p>
        </div>
        <div className={`grid gap-3 sm:gap-4 ${stats.isCurrentMonth ? 'grid-cols-2 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {stats.isCurrentMonth && (
            <>
              <section className="backdrop-blur-xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-blue-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow duration-300">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-blue-300 mx-auto mb-2" />
                <span className="text-lg sm:text-2xl font-semibold text-white">{stats.pedidosHoy}</span>
                <p className="text-blue-300 text-[10px] sm:text-xs">{t("today", language)}</p>
              </section>
              <section className="backdrop-blur-xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-blue-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow duration-300">
                <span className="text-lg sm:text-2xl font-semibold text-white">{formatPrice(stats.totalHoy)}</span>
                <p className="text-blue-300 text-[10px] sm:text-xs">{t("salesToday", language)}</p>
              </section>
            </>
          )}
          <section className="backdrop-blur-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/20 border border-cyan-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-shadow duration-300">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-300 mx-auto mb-2" />
            <span className="text-lg sm:text-2xl font-semibold text-white">{stats.pedidosMes}</span>
            <p className="text-cyan-300 text-[10px] sm:text-xs">{t("thisMonth", language)}</p>
          </section>
          <section className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/20 border border-emerald-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-shadow duration-300">
            <span className="text-lg sm:text-2xl font-semibold text-white">{formatPrice(stats.totalMes)}</span>
            <p className="text-emerald-300 text-[10px] sm:text-xs">{t("salesMonth", language)}</p>
          </section>
          <section className="backdrop-blur-xl bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-shadow duration-300">
            <span className="text-lg sm:text-2xl font-semibold text-white">{stats.pendientes}</span>
            <p className="text-amber-300 text-[10px] sm:text-xs">{t("statusPendiente", language)}</p>
          </section>
          <section className="backdrop-blur-xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-blue-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow duration-300">
            <span className="text-lg sm:text-2xl font-semibold text-white">{stats.aceptados}</span>
            <p className="text-blue-300 text-[10px] sm:text-xs">{t("statusAceptado", language)}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function PedidosPage() {
  const { empresaId, overrideEmpresaId, isSuperAdmin } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Pedido | 'origen'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedPedido, setExpandedPedido] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; numero: number | null }>({ show: false, id: null, numero: null });
  const [deleteAllConfirm, setDeleteAllConfirm] = useState<{ show: boolean; confirmText: string }>({ show: false, confirmText: '' });
  const [deletingAll, setDeletingAll] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState({ mes: new Date().getMonth(), año: new Date().getFullYear() });
  const { language } = useLanguage();

  const lang = language;
  const meses = [t("monthJan", lang), t("monthFeb", lang), t("monthMar", lang), t("monthApr", lang), t("monthMay", lang), t("monthJun", lang), t("monthJul", lang), t("monthAug", lang), t("monthSep", lang), t("monthOct", lang), t("monthNov", lang), t("monthDec", lang)];

  const cambiarMes = (delta: number) => setSelectedMonth(shiftMonth(selectedMonth, delta));

  const esMesActual = selectedMonth.mes === new Date().getMonth() && selectedMonth.año === new Date().getFullYear();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadPedidos(effectiveEmpresaId, selectedMonth, controller.signal)
      .then(data => setPedidos(data))
      .catch(handleFetchError)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [effectiveEmpresaId, selectedMonth]);

  const filteredPedidos = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return pedidos
      .filter(p => matchesPedido(p, searchTerm, term))
      .sort((a, b) => comparePedidos(a, b, sortField, sortDirection));
  }, [pedidos, searchTerm, sortField, sortDirection]);

  const handleSort = useCallback((field: keyof Pedido | 'origen') => {
    const next = nextSortState(field, sortField, sortDirection);
    setSortField(next.field);
    setSortDirection(next.direction);
  }, [sortField, sortDirection]);

  const toggleExpand = (id: string) => {
    setExpandedPedido(expandedPedido === id ? null : id);
  };

  const updateEstado = useCallback(async (id: string, nuevoEstado: string) => {
    try {
      const res = await fetchWithCsrf(`/api/admin/pedidos?empresaId=${effectiveEmpresaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ id, estado: nuevoEstado }),
      }, {
        maxRetries: 2,
        baseDelay: 500,
        retryOn: (response) => response.status >= 500 || response.status === 429
      });
      if (res.ok) {
        setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
      }
    } catch (error) {
      logClientError(error, 'updateEstado');
    }
  }, [effectiveEmpresaId]);

  const deletePedido = useCallback((id: string, orderNum: number | null) => {
    setDeleteConfirm({ show: true, id, numero: orderNum });
  }, []);

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      const res = await fetchWithCsrf(`/api/admin/pedidos?empresaId=${effectiveEmpresaId}`, {
        method: 'DELETE',
        body: JSON.stringify({ id: deleteConfirm.id }),
      }, {
        maxRetries: 2,
        baseDelay: 1000,
        retryOn: (response) => response.status >= 500 || response.status === 429
      });
      if (res.ok) {
        setPedidos(pedidos.filter(p => p.id !== deleteConfirm.id));
      }
    } catch (error) {
      logClientError(error, 'confirmDelete');
    } finally {
      setDeleteConfirm({ show: false, id: null, numero: null });
    }
  };

  const confirmDeleteAll = async () => {
    if (deleteAllConfirm.confirmText.toUpperCase() !== getDeleteConfirmationText(language)) return;
    setDeletingAll(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/pedidos/delete-all?empresaId=${effectiveEmpresaId}`, {
        method: 'DELETE',
      }, {
        maxRetries: 2,
        baseDelay: 1000,
        retryOn: (response) => response.status >= 500 || response.status === 429
      });
      if (res.ok) {
        setPedidos([]);
        setDeleteAllConfirm({ show: false, confirmText: '' });
      }
    } catch (error) {
      logClientError(error, 'confirmDeleteAll');
    } finally {
      setDeletingAll(false);
    }
  };

  const openDeleteAllDialog = () => {
    setDeleteAllConfirm({ show: true, confirmText: '' });
  };

  const stats = useMemo(() => computePedidoStats(pedidos, selectedMonth), [pedidos, selectedMonth]);

  if (loading) {
    return (
      <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header con stats skeleton */}
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48 bg-white/20" />
              <Skeleton className="h-4 w-64 bg-white/10" />
            </div>
            <SkeletonStats count={4} itemClassName="bg-white/10" />
          </div>
        </div>

        {/* Buscador skeleton */}
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl">
          <div className="p-4 border-b border-white/10">
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
          <div className="p-4">
            <SkeletonTable rows={8} columns={6} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header con stats */}
      <StatsSection stats={stats} language={language} />

      {/* Month selector */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => cambiarMes(-1)}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[140px]">
            <span className="text-lg font-semibold text-white">
              {meses[selectedMonth.mes]} {selectedMonth.año}
            </span>
            {!esMesActual && (
              <button
                onClick={() => setSelectedMonth({ mes: new Date().getMonth(), año: new Date().getFullYear() })}
                className="block text-xs text-cyan-400 hover:text-cyan-300 underline mx-auto mt-1 transition-colors"
              >
                Ver actual
              </button>
            )}
          </div>
          <button
            onClick={() => cambiarMes(1)}
            disabled={esMesActual}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t("nextMonth", language) || "Mes siguiente"}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isSuperAdmin && pedidos.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={openDeleteAllDialog}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-slate-900 focus-visible:ring-offset-2"
          >
            <Trash className="w-4 h-4" />
            {t("deleteAllOrders", language)}
          </button>
        </div>
      )}

      {/* Buscador */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <div className="relative max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-3 py-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t("searchOrders", language)}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t("searchOrders", language)}
              className="pl-10 bg-transparent border-0 text-white placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        <div className="overflow-x-auto scrollbar scrollbar-thumb-muted-foreground/40 scrollbar-track-transparent scrollbar-thin">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={getAriaSortValue(sortField, 'numero_pedido', sortDirection)}>
                  <button
                    onClick={() => handleSort('numero_pedido')}
                    className="flex items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    #
                    {sortField === 'numero_pedido' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={getAriaSortValue(sortField, 'origen', sortDirection)}>
                  <button
                    onClick={() => handleSort('origen')}
                    className="flex items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Tipo
                    {sortField === 'origen' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("customer", language)}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("phone", language)}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={getAriaSortValue(sortField, 'total', sortDirection)}>
                  <button
                    onClick={() => handleSort('total')}
                    className="flex items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("total", language)}
                    {sortField === 'total' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={getAriaSortValue(sortField, 'estado', sortDirection)}>
                  <button
                    onClick={() => handleSort('estado')}
                    className="flex items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("status", language)}
                    {sortField === 'estado' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" aria-sort={getAriaSortValue(sortField, 'created_at', sortDirection)}>
                  <button
                    onClick={() => handleSort('created_at')}
                    className="flex items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("date", language)}
                    {sortField === 'created_at' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("actions", language)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPedidos.length === 0 ? (
                <tr>
                  <td colSpan={8} aria-live="polite" className="px-4 py-8 text-center text-muted-foreground">
                    {searchTerm ? t("noOrdersFound", language) : t("noOrders", language)}
                  </td>
                </tr>
              ) : (
                filteredPedidos.map((pedido) => (
                  <Fragment key={pedido.id}>
                    <tr
                      className="hover:bg-muted/50 cursor-pointer"
                      aria-expanded={expandedPedido === pedido.id}
                      onClick={() => toggleExpand(pedido.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        #{pedido.numero_pedido}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderOrigenBadge(pedido)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {pedido.clientes?.nombre || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {pedido.clientes?.telefono || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        {formatPrice(pedido.total)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderEstadoBadge(pedido, language, updateEstado)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                        {formatDate(pedido.created_at, {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        }, language)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePedido(pedido.id, pedido.numero_pedido); }}
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label={t("deleteOrder", language)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedPedido === pedido.id && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 bg-muted/30">
                          <div className="max-w-2xl">
                            <h4 className="font-medium mb-2 text-foreground">{t("orderDetails", language)}</h4>
                            <ul className="space-y-2 text-sm text-foreground">
                              {pedido.detalle_pedido?.map((item: PedidoItem) => {
                                const complementoTotal = item.complementos?.reduce((sum: number, comp: PedidoComplemento) => sum + (comp.precio || comp.price || 0), 0) || 0;
                                const itemTotal = (item.precio * item.cantidad) + (complementoTotal * item.cantidad);
                                return (
                                  <li key={item.nombre + '-' + item.cantidad} className="flex flex-col">
                                    <div className="flex justify-between">
                                      <span>{item.cantidad}x {item.nombre}</span>
                                      <span className="font-medium">{formatPrice(itemTotal)}</span>
                                    </div>
                                    {item.complementos && item.complementos.length > 0 && (
                                      <ul className="ml-4 mt-1 text-xs text-muted-foreground">
                                        {item.complementos.map((comp: PedidoComplemento) => (
                                          <li key={comp.nombre || comp.name}>+ {comp.nombre || comp.name} ({formatPrice(comp.precio || comp.price || 0)})</li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteOrderDialog
        show={deleteConfirm.show}
        orderNumber={deleteConfirm.numero}
        language={language}
        onClose={() => setDeleteConfirm({ show: false, id: null, numero: null })}
        onConfirm={confirmDelete}
      />

      <DeleteAllOrdersDialog
        show={deleteAllConfirm.show}
        language={language}
        totalOrders={pedidos.length}
        confirmText={deleteAllConfirm.confirmText}
        isDeleting={deletingAll}
        onClose={() => setDeleteAllConfirm({ show: false, confirmText: '' })}
        onConfirmTextChange={(text) => setDeleteAllConfirm(prev => ({ ...prev, confirmText: text }))}
        onConfirm={confirmDeleteAll}
      />
    </div>
  );
}

function DeleteOrderDialog({
  show,
  orderNumber,
  language,
  onClose,
  onConfirm,
}: Readonly<{
  show: boolean;
  orderNumber: number | null;
  language: Language;
  onClose: () => void;
  onConfirm: () => void;
}>) {
  return (
    <Dialog open={show} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            {t("deleteOrder", language)}
          </DialogTitle>
          <DialogDescription>
            {t("deleteOrderConfirm", language)} <strong>#{orderNumber}</strong>? {t("cannotUndo", language)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {t("cancel", language)}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {t("delete", language)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAllOrdersDialog({
  show,
  language,
  totalOrders,
  confirmText,
  isDeleting,
  onClose,
  onConfirmTextChange,
  onConfirm,
}: Readonly<{
  show: boolean;
  language: Language;
  totalOrders: number;
  confirmText: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirmTextChange: (text: string) => void;
  onConfirm: () => void;
}>) {
  const expectedText = getDeleteConfirmationText(language);
  const isValidated = confirmText.toUpperCase() === expectedText;

  return (
    <Dialog open={show} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            {t("deleteAllOrders", language)}
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span>{t("deleteAllOrdersConfirm", language)}</span>
            <span className="block text-sm text-muted-foreground">
              {t("deleteAllOrdersWarning", language)} <strong className="text-destructive">{totalOrders}</strong> {t("deleteAllOrdersWarningEnd", language)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="confirmText" className="block text-sm font-medium mb-2">
              {t("confirmingDeleteAll", language)}
            </label>
            <Input
              id="confirmText"
              type="text"
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              placeholder={expectedText}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              disabled={isDeleting}
            >
              {t("cancel", language)}
            </button>
            <button
              onClick={onConfirm}
              disabled={!isValidated || isDeleting}
              className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? getDeletingText(language) : t("delete", language)}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
