'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronLeft, ChevronRight, ShieldCheck, MonitorCheck, UtensilsCrossed, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { AuditLogEntry, AuditAction, ActorTipo } from '@/core/domain/entities/audit-types';

const LIMIT = 50;

const AUDIT_ACTIONS: AuditAction[] = [
  'tpv.turno.abrir',
  'tpv.turno.cerrar',
  'tpv.cobro.completar',
  'tpv.cobro.rectificar',
  'tpv.caja.movimiento',
  'tpv.stock.merma',
  'tpv.empleado.login',
  'tpv.empleado.logout',
  'waiter.mesa.cerrar_sesion',
  'waiter.pedido.validar',
  'waiter.pago.manual',
  'admin.stock.ajuste',
];

const ACTION_LABELS: Record<AuditAction, string> = {
  'tpv.turno.abrir':          'Abrir turno',
  'tpv.turno.cerrar':         'Cerrar turno',
  'tpv.cobro.completar':      'Cobro completado',
  'tpv.cobro.rectificar':     'Cobro rectificado',
  'tpv.caja.movimiento':      'Movimiento de caja',
  'tpv.stock.merma':          'Merma registrada',
  'tpv.empleado.login':       'Empleado: inicio de sesión',
  'tpv.empleado.logout':      'Empleado: cierre de sesión',
  'waiter.mesa.cerrar_sesion':'Cerrar sesión de mesa',
  'waiter.pedido.validar':    'Pedido validado',
  'waiter.pago.manual':       'Pago manual registrado',
  'admin.stock.ajuste':       'Ajuste de stock',
};

const ACTOR_TIPOS: ActorTipo[] = ['admin', 'empleado_tpv', 'waiter', 'system'];

const ACTOR_CONFIG: Record<ActorTipo, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  admin:        { label: 'Administrador',  icon: ShieldCheck,      className: 'bg-violet-500/15 border-violet-400/30 text-violet-300' },
  empleado_tpv: { label: 'Empleado TPV',   icon: MonitorCheck,     className: 'bg-amber-500/15 border-amber-400/30 text-amber-300'   },
  waiter:       { label: 'Camarero',       icon: UtensilsCrossed,  className: 'bg-blue-500/15 border-blue-400/30 text-blue-300'      },
  system:       { label: 'Sistema',        icon: Bot,              className: 'bg-slate-500/15 border-slate-400/30 text-slate-300'   },
};

function resolveActionColor(action: string): string {
  if (action.startsWith('tpv.')) return 'bg-amber-500/20 border-amber-400/30 text-amber-300';
  if (action.startsWith('waiter.')) return 'bg-blue-500/20 border-blue-400/30 text-blue-300';
  if (action.startsWith('admin.')) return 'bg-violet-500/20 border-violet-400/30 text-violet-300';
  return 'bg-slate-500/20 border-slate-400/30 text-slate-300';
}

interface ActionBadgeProps {
  action: string;
}

function ActionBadge({ action }: Readonly<ActionBadgeProps>) {
  const colorClass = resolveActionColor(action);
  const label = ACTION_LABELS[action as AuditAction] ?? action;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

interface ActorBadgeProps {
  actorTipo: ActorTipo;
}

function ActorBadge({ actorTipo }: Readonly<ActorBadgeProps>) {
  const config = ACTOR_CONFIG[actorTipo] ?? ACTOR_CONFIG.system;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${config.className}`}>
      <Icon className="w-3 h-3 shrink-0" />
      {config.label}
    </span>
  );
}

interface FiltersState {
  action: string;
  actorTipo: string;
  fromDate: string;
  toDate: string;
}

function buildQueryString(page: number, filters: FiltersState): string {
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (filters.action) params.set('action', filters.action);
  if (filters.actorTipo) params.set('actorTipo', filters.actorTipo);
  if (filters.fromDate) params.set('from', filters.fromDate);
  if (filters.toDate) params.set('to', filters.toDate);
  return params.toString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface AuditResponse {
  data: AuditLogEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export default function AuditLogPage() {
  const { language } = useLanguage();
  const [response, setResponse] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FiltersState>({
    action: '',
    actorTipo: '',
    fromDate: '',
    toDate: '',
  });
  const [pendingFilters, setPendingFilters] = useState<FiltersState>(filters);

  const fetchData = useCallback(async (currentPage: number, currentFilters: FiltersState) => {
    setLoading(true);
    setError('');
    try {
      const qs = buildQueryString(currentPage, currentFilters);
      const res = await fetch(`/api/admin/audit-log?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as AuditResponse;
      setResponse(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(page, filters);
  }, [fetchData, page, filters]);

  function handleSearch() {
    setPage(1);
    setFilters({ ...pendingFilters });
  }

  const totalPages = response?.meta.totalPages ?? 1;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">{t('auditLogTitle', language)}</h1>

      {/* Filters */}
      <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 mb-6">
        <p className="text-sm font-medium text-slate-300 mb-3">{t('auditLogFilters', language)}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">{t('auditLogAction', language)}</label>
            <select
              value={pendingFilters.action}
              onChange={(e) => setPendingFilters((prev) => ({ ...prev, action: e.target.value }))}
              className="bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">{t('auditLogAll', language)}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">{t('auditLogActorType', language)}</label>
            <select
              value={pendingFilters.actorTipo}
              onChange={(e) => setPendingFilters((prev) => ({ ...prev, actorTipo: e.target.value }))}
              className="bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">{t('auditLogAll', language)}</option>
              {ACTOR_TIPOS.map((tipo) => (
                <option key={tipo} value={tipo}>{ACTOR_CONFIG[tipo].label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">{t('auditLogFromDate', language)}</label>
            <input
              type="date"
              value={pendingFilters.fromDate}
              onChange={(e) => setPendingFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              className="bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">{t('auditLogToDate', language)}</label>
            <input
              type="date"
              value={pendingFilters.toDate}
              onChange={(e) => setPendingFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              className="bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <Button onClick={handleSearch} className="mt-3" size="sm">
          {t('auditLogSearch', language)}
        </Button>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
          {error}
          <Button onClick={() => void fetchData(page, filters)} variant="ghost" size="sm" className="ml-3">
            {t('auditLogRetry', language)}
          </Button>
        </div>
      )}

      {!loading && !error && response && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/80">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">{t('auditLogDate', language)}</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">{t('auditLogAction', language)}</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">{t('auditLogActorType', language)}</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">{t('auditLogActorId', language)}</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">{t('auditLogDetails', language)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {response.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      {t('auditLogNoRecords', language)}
                    </td>
                  </tr>
                )}
                {response.data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3"><ActionBadge action={entry.action} /></td>
                    <td className="px-4 py-3"><ActorBadge actorTipo={entry.actorTipo} /></td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{entry.actorId ?? '—'}</td>
                    <td className="px-4 py-3">
                      <details>
                        <summary className="cursor-pointer text-slate-400 hover:text-slate-200 text-xs">
                          {t('auditLogDetails', language)}
                        </summary>
                        <pre className="mt-2 text-xs text-slate-300 bg-slate-900/60 rounded p-2 max-w-xs overflow-auto">
                          {JSON.stringify(entry.payload, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {response.data.length === 0 && (
              <p className="text-center text-slate-500 py-8">{t('auditLogNoRecords', language)}</p>
            )}
            {response.data.map((entry) => (
              <div key={entry.id} className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-2">{formatDate(entry.createdAt)}</p>
                <ActionBadge action={entry.action} />
                <div className="flex items-center gap-2 mt-2">
                  <ActorBadge actorTipo={entry.actorTipo} />
                  <span className="text-xs text-slate-500 font-mono">{entry.actorId ?? '—'}</span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-slate-400 text-xs">{t('auditLogDetails', language)}</summary>
                  <pre className="mt-1 text-xs text-slate-300 bg-slate-900/60 rounded p-2 overflow-auto">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('stockAnterior', language)}
              </Button>
              <span className="text-sm text-slate-400">
                {t('auditLogPage', language)} {page} {t('auditLogOf', language)} {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('stockSiguiente', language)}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
