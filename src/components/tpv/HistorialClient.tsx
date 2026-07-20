'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken } from '@/lib/csrf-client';

interface PedidoItem {
  nombre: string;
  cantidad: number;
  precio: number;
}

interface PedidoRow {
  id: string;
  numeroPedido: number;
  total: number;
  estado: string;
  createdAt: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: PedidoItem[];
}

interface CobroRow {
  id: string;
  serie: string;
  numeroTicket: number;
  metodoPago: 'efectivo' | 'tarjeta';
  importeCobradoCents: number;
  propinaCents: number;
  ivaPorcentaje: number;
  baseImponibleCents: number;
  ivaCents: number;
  hash: string;
  cobradoAt: string;
  rectificaCobroId: string | null;
  yaRectificado: boolean;
  originalTicket: { serie: string; numeroTicket: number } | null;
}

interface TurnoOption {
  id: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  activo: boolean;
}

interface Props {
  pedidos: PedidoRow[];
  cobros: CobroRow[];
  turnoAperturaAt: string;
  tipoImpuesto: 'iva' | 'igic';
  turnos: TurnoOption[];
  turnoId: string;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_validacion: 'Validando',
  en_preparacion: 'En cocina',
  preparado: 'Listo',
  servido: 'Servido',
  cancelado: 'Cancelado',
  retenido: 'Retenido',
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#64748b',
  pendiente_validacion: '#7c3aed',
  en_preparacion: '#f59e0b',
  preparado: '#16a34a',
  servido: '#2563eb',
  cancelado: '#ef4444',
  retenido: '#f97316',
};

function fmt(euros: number): string {
  return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

type Tab = 'pedidos' | 'cobros';

function CobrosList({ cobros }: Readonly<{ cobros: CobroRow[] }>) {
  const router = useRouter();
  const [rectificando, setRectificando] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRectificar(cobroId: string) {
    setRectificando(cobroId);
    setErrorMsg(null);
    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/tpv/cobro/rectificar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ cobroId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(json.error ?? 'Error al rectificar el cobro');
      }
    } catch {
      setErrorMsg('Error de conexión al rectificar');
    } finally {
      setRectificando(null);
      setConfirm(null);
    }
  }

  if (cobros.length === 0) {
    return <p className="text-center text-[#94a3b8] text-sm py-16">No hay cobros registrados en este turno.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {errorMsg && (
        <div className="bg-[#fef2f2] border border-[#fca5a5] text-[#ef4444] text-xs rounded-xl px-4 py-2 mb-1">
          {errorMsg}
        </div>
      )}
      {cobros.map(c => {
        const isRectificativo = c.rectificaCobroId !== null;
        const importe = c.importeCobradoCents / 100;
        const isNegative = importe < 0;

        const originalEnLista = isRectificativo
          ? cobros.find(o => o.id === c.rectificaCobroId) ?? null
          : null;
        const originalLabel = originalEnLista
          ? `${originalEnLista.serie}-${String(originalEnLista.numeroTicket).padStart(6, '0')}`
          : c.originalTicket
          ? `${c.originalTicket.serie}-${String(c.originalTicket.numeroTicket).padStart(6, '0')} (otro turno)`
          : null;

        return (
          <div key={c.id} className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 flex items-center gap-4 shadow-sm">
            <span className="font-mono text-xs text-[#64748b] w-20 shrink-0">
              {c.serie}-{String(c.numeroTicket).padStart(6, '0')}
            </span>
            <span className="text-xs text-[#64748b] shrink-0 w-10">
              {fmtTime(c.cobradoAt)}
            </span>
            <span className="text-xs text-[#64748b] capitalize flex-1">
              {c.metodoPago}
              {isRectificativo && (
                <span className="ml-2 text-[#f59e0b] font-bold text-[10px] uppercase">
                  Rectificativo{originalLabel ? ` · anula ${originalLabel}` : ''}
                </span>
              )}
            </span>
            <span className={`text-sm font-bold shrink-0 ${isNegative ? 'text-[#ef4444]' : 'text-[#0f172a]'}`}>
              {fmt(importe)}
            </span>

            {!isRectificativo && !c.yaRectificado && (
              confirm === c.id ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="text-xs px-2 py-1 rounded border border-[#e2e8f0] text-[#64748b] hover:text-[#0f172a] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRectificar(c.id)}
                    disabled={rectificando === c.id}
                    className="text-xs px-2 py-1 rounded bg-[#ef4444] text-white font-bold disabled:opacity-50"
                  >
                    {rectificando === c.id ? '...' : 'Confirmar'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(c.id)}
                  className="shrink-0 text-xs px-3 py-1 rounded-lg border border-[#fca5a5] text-[#ef4444] hover:bg-[#fef2f2] transition-colors"
                >
                  Rectificar
                </button>
              )
            )}

            {c.yaRectificado && (
              <span className="shrink-0 text-[10px] text-[#f59e0b] uppercase tracking-wider">Rectificado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function turnoLabel(t: TurnoOption): string {
  const apertura = new Date(t.aperturaAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (t.activo) return `Turno activo · desde ${apertura}`;
  const cierre = t.cierreAt
    ? new Date(t.cierreAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';
  return `${apertura}–${cierre} · ${t.operadorNombre}`;
}

export function HistorialClient({ pedidos, cobros, turnoAperturaAt, tipoImpuesto, turnos, turnoId }: Readonly<Props>) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pedidos');

  const totalFacturado = pedidos
    .filter(p => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + p.total, 0);

  const totalCobrado = cobros
    .reduce((sum, c) => sum + c.importeCobradoCents, 0) / 100;

  const cobrosValidos = cobros.filter(c => c.rectificaCobroId === null);
  const ticketMedioCents = cobrosValidos.length > 0
    ? Math.round(cobrosValidos.reduce((s, c) => s + c.importeCobradoCents, 0) / cobrosValidos.length)
    : 0;

  const totalIvaCents = cobrosValidos.reduce((s, c) => s + c.ivaCents, 0);
  const totalEfectivoCents = cobrosValidos
    .filter(c => c.metodoPago === 'efectivo')
    .reduce((s, c) => s + c.importeCobradoCents, 0);
  const totalTarjetaCents = cobrosValidos
    .filter(c => c.metodoPago === 'tarjeta')
    .reduce((s, c) => s + c.importeCobradoCents, 0);
  const totalBruto = totalEfectivoCents + totalTarjetaCents;
  const pctEfectivo = totalBruto > 0 ? Math.round((totalEfectivoCents / totalBruto) * 100) : 0;

  return (
    <div className="flex-1 overflow-auto p-6 bg-[#f1f5f9]">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-[#0f172a]">Historial del turno</h2>
            <p className="text-xs text-[#64748b] mt-0.5">
              Desde las {fmtTime(turnoAperturaAt)} del {fmtDate(turnoAperturaAt)}
            </p>
            {turnos.length > 1 && (
              <select
                value={turnoId}
                onChange={e => router.push(`/tpv/historial?turnoId=${e.target.value}`)}
                className="mt-2 text-xs bg-white border border-[#e2e8f0] text-[#0f172a] rounded-lg px-3 py-1.5 outline-none focus:border-[#2563eb] cursor-pointer"
              >
                {turnos.map(t => (
                  <option key={t.id} value={t.id}>{turnoLabel(t)}</option>
                ))}
              </select>
            )}
          </div>

          {/* KPI cards */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-center shadow-sm min-w-[80px]">
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Pedidos</p>
              <p className="text-xl font-bold text-[#0f172a]">{pedidos.length}</p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-center shadow-sm min-w-[100px]">
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Facturado</p>
              <p className="text-xl font-bold text-[#0f172a]">{fmt(totalFacturado)}</p>
            </div>
            <div className="bg-white border border-[#86efac] rounded-xl px-4 py-3 text-center shadow-sm min-w-[100px]">
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Cobrado</p>
              <p className="text-xl font-bold text-[#16a34a]">{fmt(totalCobrado)}</p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-center shadow-sm min-w-[100px]">
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Ticket ∅</p>
              <p className="text-xl font-bold text-[#2563eb]">{fmt(ticketMedioCents / 100)}</p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-center shadow-sm min-w-[80px]">
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">{tipoImpuesto.toUpperCase()}</p>
              <p className="text-xl font-bold text-[#f59e0b]">{fmt(totalIvaCents / 100)}</p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-center shadow-sm min-w-[90px]">
              <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Efectivo</p>
              <p className="text-xl font-bold text-[#16a34a]">{pctEfectivo}%</p>
              <p className="text-[10px] text-[#64748b]">{100 - pctEfectivo}% tarjeta</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#e2e8f0] pb-0">
          <button
            type="button"
            onClick={() => setTab('pedidos')}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === 'pedidos'
                ? 'border-[#2563eb] text-[#2563eb]'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Pedidos ({pedidos.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('cobros')}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === 'cobros'
                ? 'border-[#2563eb] text-[#2563eb]'
                : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Cobros ({cobros.length})
          </button>
        </div>

        {tab === 'cobros' && <CobrosList cobros={cobros} />}

        {tab === 'pedidos' && pedidos.length === 0 && (
          <p className="text-center text-[#94a3b8] text-sm py-16">
            No hay pedidos en este turno todavía.
          </p>
        )}

        {tab === 'pedidos' && (
          <div className="flex flex-col gap-2">
            {pedidos.map(p => {
              const isExpanded = expanded === p.id;
              const color = ESTADO_COLOR[p.estado] ?? '#64748b';
              const mesaLabel = p.mesaNumero !== null
                ? `Mesa ${p.mesaNumero}${p.mesaNombre ? ` · ${p.mesaNombre}` : ''}`
                : 'Sin mesa';

              return (
                <div
                  key={p.id}
                  className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : p.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[#f8fafc] transition-colors text-left"
                  >
                    <span className="text-[#64748b] text-xs font-mono w-10 shrink-0">
                      #{p.numeroPedido}
                    </span>

                    <span className="text-xs text-[#64748b] shrink-0 w-10">
                      {fmtTime(p.createdAt)}
                    </span>

                    <span className="text-sm text-[#0f172a] font-medium flex-1 truncate">
                      {mesaLabel}
                    </span>

                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ color, background: color + '20' }}
                    >
                      {ESTADO_LABEL[p.estado] ?? p.estado}
                    </span>

                    <span className="text-sm font-bold text-[#0f172a] shrink-0 w-20 text-right">
                      {fmt(p.total)}
                    </span>

                    <span className="text-[#94a3b8] text-xs shrink-0">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#e2e8f0] px-4 py-3 bg-[#f8fafc]">
                      {p.items.map((it, idx) => (
                        <div key={idx} className="flex items-center gap-3 py-1.5">
                          <span className="w-5 h-5 rounded bg-[#e2e8f0] text-[#64748b] text-xs flex items-center justify-center shrink-0 font-semibold">
                            {it.cantidad}
                          </span>
                          <span className="text-sm text-[#475569] flex-1">{it.nombre}</span>
                          <span className="text-sm text-[#64748b]">{fmt(it.precio * it.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
