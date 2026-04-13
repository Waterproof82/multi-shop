'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Search, ChevronDown, ChevronUp, Check, Clock, Trash2, ShoppingCart, Calendar, Trash, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { PedidoItem, PedidoComplemento } from '@/core/domain/entities/types';
import { PEDIDO_ESTADOS, PEDIDO_ESTADO_COLORS, type PedidoEstado } from '@/core/domain/constants/pedido';
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
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import { SkeletonTable, SkeletonStats, Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format-date';

interface Cliente {
  nombre: string | null;
  email: string | null;
  telefono: string | null;
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
}

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
    if (sortDirection === 'asc') {
      return 'ascending';
    } else {
      return 'descending';
    }
  }
  return 'none';
}

export default function PedidosPage() {
  const { empresaId, overrideEmpresaId, isSuperAdmin } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Pedido>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedPedido, setExpandedPedido] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; numero: number | null }>({ show: false, id: null, numero: null });
  const [deleteAllConfirm, setDeleteAllConfirm] = useState<{ show: boolean; confirmText: string }>({ show: false, confirmText: '' });
  const [deletingAll, setDeletingAll] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState({ mes: new Date().getMonth(), año: new Date().getFullYear() });
  const { language } = useLanguage();

  const lang = language;
  const meses = [t("monthJan", lang), t("monthFeb", lang), t("monthMar", lang), t("monthApr", lang), t("monthMay", lang), t("monthJun", lang), t("monthJul", lang), t("monthAug", lang), t("monthSep", lang), t("monthOct", lang), t("monthNov", lang), t("monthDec", lang)];

  const cambiarMes = (delta: number) => {
    const nuevoMes = selectedMonth.mes + delta;
    const nuevoAño = selectedMonth.año + Math.floor(nuevoMes / 12);
    const mesAjustado = ((nuevoMes % 12) + 12) % 12;
    setSelectedMonth({ mes: mesAjustado, año: nuevoAño });
  };

  const esMesActual = selectedMonth.mes === new Date().getMonth() && selectedMonth.año === new Date().getFullYear();

  useEffect(() => {
    const controller = new AbortController();
    async function fetchPedidos() {
      setLoading(true);
      try {
        const url = `/api/admin/pedidos?empresaId=${effectiveEmpresaId}&mes=${selectedMonth.mes}&año=${selectedMonth.año}`;
        const res = await fetchWithCsrf(url, {
          signal: controller.signal
        }, {
          maxRetries: 3,
          baseDelay: 1000,
          retryOn: (response) => response.status >= 500 || response.status === 429 || response.status === 408
        });
        if (res.ok) {
          const data = await res.json();
          setPedidos(data.pedidos || []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        logClientError(error, 'fetchPedidos');
      } finally {
        setLoading(false);
      }
    }
    fetchPedidos();
    return () => controller.abort();
  }, [effectiveEmpresaId, selectedMonth.mes, selectedMonth.año]);

  const filteredPedidos = useMemo(() => pedidos
    .filter(p =>
      p.numero_pedido.toString().includes(searchTerm) ||
      p.clientes?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientes?.telefono?.includes(searchTerm) ||
      p.clientes?.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }), [pedidos, searchTerm, sortField, sortDirection]);

  const handleSort = useCallback((field: keyof Pedido) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField, sortDirection]);

  const ESTADO_TRANSLATION_KEYS: Record<PedidoEstado, keyof typeof import('@/lib/translations').translations.es> = {
    pendiente: 'statusPendiente',
    aceptado: 'statusAceptado',
    preparando: 'statusPreparando',
    enviado: 'statusEnviado',
    entregado: 'statusEntregado',
    cancelado: 'statusCancelado',
  };

  const getEstadoBadge = (estado: string, pedidoId: string) => {
    const estadoIndex = PEDIDO_ESTADOS.indexOf(estado as PedidoEstado);
    const isPendiente = estadoIndex <= 0;
    const siguienteEstado = isPendiente ? 'aceptado' : 'pendiente';
    const translationKey = ESTADO_TRANSLATION_KEYS[estado as PedidoEstado];

    return (
      <button
        onClick={(e) => { e.stopPropagation(); updateEstado(pedidoId, siguienteEstado); }}
        aria-label={`${translationKey ? t(translationKey, language) : estado} — ${t("edit", language)}`}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          PEDIDO_ESTADO_COLORS[estado as PedidoEstado] || 'bg-muted text-foreground hover:bg-muted/80'
        }`}
      >
        {estado === 'pendiente' || estado === 'cancelado' ? <Clock className="w-3 h-3" /> : <Check className="w-3 h-3" />}
        {translationKey ? t(translationKey, language) : estado}
      </button>
    );
  };

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

  const stats = useMemo(() => {
    const today = new Date();
    const selectedMonthStart = new Date(selectedMonth.año, selectedMonth.mes, 1);
    const selectedMonthEnd = new Date(selectedMonth.año, selectedMonth.mes + 1, 0, 23, 59, 59);
    
    const isCurrentMonth = selectedMonth.mes === today.getMonth() && selectedMonth.año === today.getFullYear();
    
    let pedidosHoy: Pedido[] = [];
    let pedidosDelMes: Pedido[] = [];
    
    if (isCurrentMonth) {
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      pedidosHoy = pedidos.filter(p => new Date(p.created_at) >= todayStart);
      pedidosDelMes = pedidos.filter(p => new Date(p.created_at) >= selectedMonthStart);
    } else {
      pedidosDelMes = pedidos.filter(p => {
        const created = new Date(p.created_at);
        return created >= selectedMonthStart && created <= selectedMonthEnd;
      });
      pedidosHoy = [];
    }
    
    const pendientes = pedidosDelMes.filter(p => p.estado === 'pendiente').length;
    const aceptados = pedidosDelMes.filter(p => p.estado === 'aceptado' || p.estado === 'preparando' || p.estado === 'enviado' || p.estado === 'entregado').length;
    
    return {
      pedidosHoy: pedidosHoy.length,
      totalHoy: pedidosHoy.reduce((sum, p) => sum + p.total, 0),
      pedidosMes: pedidosDelMes.length,
      totalMes: pedidosDelMes.reduce((sum, p) => sum + p.total, 0),
      pendientes,
      aceptados,
      isCurrentMonth,
    };
  }, [pedidos, selectedMonth]);

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
                  <td colSpan={7} aria-live="polite" className="px-4 py-8 text-center text-muted-foreground">
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
                        {getEstadoBadge(pedido.estado, pedido.id)}
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
                        <td colSpan={7} className="px-4 py-4 bg-muted/30">
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

      <Dialog open={deleteConfirm.show} onOpenChange={(open) => { if (!open) setDeleteConfirm({ show: false, id: null, numero: null }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-full">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              {t("deleteOrder", language)}
            </DialogTitle>
            <DialogDescription>
              {t("deleteOrderConfirm", language)} <strong>#{deleteConfirm.numero}</strong>? {t("cannotUndo", language)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirm({ show: false, id: null, numero: null })}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              {t("cancel", language)}
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              {t("delete", language)}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllConfirm.show} onOpenChange={(open) => { if (!open) setDeleteAllConfirm({ show: false, confirmText: '' }); }}>
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
                {t("deleteAllOrdersWarning", language)} <strong className="text-destructive">{pedidos.length}</strong> {t("deleteAllOrdersWarningEnd", language)}
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
                value={deleteAllConfirm.confirmText}
                onChange={(e) => setDeleteAllConfirm(prev => ({ ...prev, confirmText: e.target.value }))}
                placeholder={getDeleteConfirmationText(language)}
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteAllConfirm({ show: false, confirmText: '' })}
                className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                disabled={deletingAll}
              >
                {t("cancel", language)}
              </button>
              <button
                onClick={confirmDeleteAll}
                disabled={deleteAllConfirm.confirmText.toUpperCase() !== getDeleteConfirmationText(language) || deletingAll}
                className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingAll ? getDeletingText(language) : t("delete", language)}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
