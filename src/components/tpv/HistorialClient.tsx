'use client';

import { useState } from 'react';
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
  paymentStatus: string | null;
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
}

interface Props {
  pedidos: PedidoRow[];
  cobros: CobroRow[];
  turnoAperturaAt: string;
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
  pendiente: '#6b7280',
  pendiente_validacion: '#a78bfa',
  en_preparacion: '#f59e0b',
  preparado: '#22c55e',
  servido: '#4f72ff',
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
  const [rectificando, setRectificando] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [rectificados, setRectificados] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    cobros.forEach(c => { if (c.rectificaCobroId) ids.add(c.rectificaCobroId); });
    return ids;
  });

  async function handleRectificar(cobroId: string) {
    setRectificando(cobroId);
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
        setRectificados(prev => new Set([...prev, cobroId]));
      }
    } finally {
      setRectificando(null);
      setConfirm(null);
    }
  }

  if (cobros.length === 0) {
    return <p className="text-center text-[#6b7280] text-sm py-16">No hay cobros registrados en este turno.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {cobros.map(c => {
        const isRectificativo = c.rectificaCobroId !== null;
        const yaRectificado = rectificados.has(c.id);
        const importe = c.importeCobradoCents / 100;
        const isNegative = importe < 0;

        return (
          <div key={c.id} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center gap-4">
            <span className="font-mono text-xs text-[#6b7280] w-20 shrink-0">
              {c.serie}-{String(c.numeroTicket).padStart(6, '0')}
            </span>
            <span className="text-xs text-[#6b7280] shrink-0 w-10">
              {fmtTime(c.cobradoAt)}
            </span>
            <span className="text-xs text-[#6b7280] capitalize flex-1">
              {c.metodoPago}
              {isRectificativo && (
                <span className="ml-2 text-[#f59e0b] font-bold text-[10px] uppercase">Rectificativo</span>
              )}
            </span>
            <span className={`text-sm font-bold shrink-0 ${isNegative ? 'text-[#ef4444]' : 'text-[#e8eaf0]'}`}>
              {fmt(importe)}
            </span>

            {!isRectificativo && !yaRectificado && (
              confirm === c.id ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="text-xs px-2 py-1 rounded border border-[#2e3347] text-[#6b7280] hover:text-white"
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
                  className="shrink-0 text-xs px-3 py-1 rounded-lg border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444420] transition-colors"
                >
                  Rectificar
                </button>
              )
            )}

            {yaRectificado && (
              <span className="shrink-0 text-[10px] text-[#6b7280] uppercase tracking-wider">Rectificado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HistorialClient({ pedidos, cobros, turnoAperturaAt }: Readonly<Props>) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pedidos');

  const totalFacturado = pedidos
    .filter(p => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + p.total, 0);

  const totalCobrado = pedidos
    .filter(p => p.paymentStatus === 'paid')
    .reduce((sum, p) => sum + p.total, 0);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-[#e8eaf0]">Historial del turno</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Desde las {fmtTime(turnoAperturaAt)} del {fmtDate(turnoAperturaAt)}
            </p>
            <div className="flex gap-1 mt-3">
              <button
                type="button"
                onClick={() => setTab('pedidos')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${tab === 'pedidos' ? 'bg-[#4f72ff] text-white' : 'text-[#6b7280] hover:text-white'}`}
              >
                Pedidos ({pedidos.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('cobros')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${tab === 'cobros' ? 'bg-[#4f72ff] text-white' : 'text-[#6b7280] hover:text-white'}`}
              >
                Cobros ({cobros.length})
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Pedidos</p>
              <p className="text-xl font-bold text-[#e8eaf0]">{pedidos.length}</p>
            </div>
            <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Facturado</p>
              <p className="text-xl font-bold text-[#e8eaf0]">{fmt(totalFacturado)}</p>
            </div>
            <div className="bg-[#1a1d27] border border-[#22c55e]/40 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Cobrado</p>
              <p className="text-xl font-bold text-[#22c55e]">{fmt(totalCobrado)}</p>
            </div>
          </div>
        </div>

        {tab === 'cobros' && <CobrosList cobros={cobros} />}

        {tab === 'pedidos' && pedidos.length === 0 && (
          <p className="text-center text-[#6b7280] text-sm py-16">
            No hay pedidos en este turno todavía.
          </p>
        )}

        {tab === 'pedidos' && <div className="flex flex-col gap-2">
          {pedidos.map(p => {
            const isExpanded = expanded === p.id;
            const color = ESTADO_COLOR[p.estado] ?? '#6b7280';
            const mesaLabel = p.mesaNumero !== null
              ? `Mesa ${p.mesaNumero}${p.mesaNombre ? ` · ${p.mesaNombre}` : ''}`
              : 'Sin mesa';

            return (
              <div
                key={p.id}
                className="bg-[#1a1d27] border border-[#2e3347] rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[#22263a] transition-colors text-left"
                >
                  <span className="text-[#6b7280] text-xs font-mono w-10 shrink-0">
                    #{p.numeroPedido}
                  </span>

                  <span className="text-xs text-[#6b7280] shrink-0 w-10">
                    {fmtTime(p.createdAt)}
                  </span>

                  <span className="text-sm text-[#c8cad4] font-medium flex-1 truncate">
                    {mesaLabel}
                  </span>

                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ color, background: color + '22' }}
                  >
                    {ESTADO_LABEL[p.estado] ?? p.estado}
                  </span>

                  {p.paymentStatus === 'paid' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 text-[#22c55e] bg-[#22c55e22]">
                      Cobrado
                    </span>
                  )}

                  <span className="text-sm font-bold text-[#e8eaf0] shrink-0 w-20 text-right">
                    {fmt(p.total)}
                  </span>

                  <span className="text-[#6b7280] text-xs shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#2e3347] px-4 py-3">
                    {p.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 py-1.5">
                        <span className="w-5 h-5 rounded bg-[#22263a] text-[#6b7280] text-xs flex items-center justify-center shrink-0">
                          {it.cantidad}
                        </span>
                        <span className="text-sm text-[#c8cad4] flex-1">{it.nombre}</span>
                        <span className="text-sm text-[#6b7280]">{fmt(it.precio * it.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>}
      </div>
    </div>
  );
}
