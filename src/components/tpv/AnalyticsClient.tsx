'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { TpvAnalytics, TipoImpuesto } from '@/core/domain/entities/tpv-types';

const TpvBarChart = dynamic(
  () => import('@/components/tpv/TpvBarChart').then(m => m.TpvBarChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-[#6b7280]" />
      </div>
    ),
  }
);

type Periodo = 'hoy' | 'semana' | 'mes' | 'custom';

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function calcDesdeHasta(periodo: Periodo, customDesde: string, customHasta: string): [string, string] {
  const today = new Date();
  if (periodo === 'hoy') return [toDateStr(today), toDateStr(today)];
  if (periodo === 'semana') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return [toDateStr(from), toDateStr(today)];
  }
  if (periodo === 'mes') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return [toDateStr(from), toDateStr(today)];
  }
  return [customDesde, customHasta];
}

function periodoLabel(p: Periodo): string {
  if (p === 'semana') return 'Semana';
  if (p === 'custom') return 'Custom';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

interface Props {
  readonly initialData: TpvAnalytics;
  readonly tipoImpuesto: TipoImpuesto;
}

export function AnalyticsClient({ initialData, tipoImpuesto }: Props) {
  const today = toDateStr(new Date());
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [customDesde, setCustomDesde] = useState(today);
  const [customHasta, setCustomHasta] = useState(today);
  const [data, setData] = useState<TpvAnalytics>(initialData);
  const [loading, setLoading] = useState(false);
  const impLabel = tipoImpuesto.toUpperCase();

  async function fetchData(p: Periodo, cd: string, ch: string) {
    const [desde, hasta] = calcDesdeHasta(p, cd, ch);
    setLoading(true);
    try {
      const res = await fetch(`/api/tpv/analytics?desde=${desde}&hasta=${hasta}`);
      if (res.ok) setData(await res.json() as TpvAnalytics);
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodo(p: Periodo) {
    setPeriodo(p);
    if (p !== 'custom') void fetchData(p, customDesde, customHasta);
  }

  function handleCustomApply() {
    void fetchData('custom', customDesde, customHasta);
  }

  const totalBruto = data.splitEfectivoCents + data.splitTarjetaCents;
  const pctEfectivo = totalBruto > 0 ? Math.round((data.splitEfectivoCents / totalBruto) * 100) : 0;

  const activeHours = data.ventasPorHora
    .map((v, i) => ({ hora: i, total: v }))
    .filter(h => h.total > 0);
  const minHora = activeHours.length > 0 ? Math.max(0, Math.min(...activeHours.map(h => h.hora)) - 1) : 8;
  const maxHora = activeHours.length > 0 ? Math.min(23, Math.max(...activeHours.map(h => h.hora)) + 1) : 22;
  const chartData = data.ventasPorHora
    .map((total, hora) => ({ hora: `${hora}h`, total: total / 100 }))
    .slice(minHora, maxHora + 1);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-[#e8eaf0]">Analítica TPV</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">Rendimiento de caja por período</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />}
            <div className="flex gap-1 bg-[#1a1d27] border border-[#2e3347] rounded-xl p-1">
              {(['hoy', 'semana', 'mes', 'custom'] as Periodo[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePeriodo(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    periodo === p ? 'bg-[#4f72ff] text-white' : 'text-[#6b7280] hover:text-white'
                  }`}
                >
                  {periodoLabel(p)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom date inputs */}
        {periodo === 'custom' && (
          <div className="flex items-center gap-3 mb-6 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3">
            <input
              type="date"
              value={customDesde}
              onChange={e => setCustomDesde(e.target.value)}
              className="bg-transparent text-sm text-[#e8eaf0] border border-[#2e3347] rounded-lg px-2 py-1"
            />
            <span className="text-[#6b7280] text-sm">→</span>
            <input
              type="date"
              value={customHasta}
              onChange={e => setCustomHasta(e.target.value)}
              className="bg-transparent text-sm text-[#e8eaf0] border border-[#2e3347] rounded-lg px-2 py-1"
            />
            <button
              type="button"
              onClick={handleCustomApply}
              className="ml-2 px-4 py-1.5 rounded-lg bg-[#4f72ff] text-white text-xs font-semibold"
            >
              Aplicar
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Facturado', value: fmt(data.totalFacturadoCents), sub: `${data.numCobros} cobros`, color: 'text-[#e8eaf0]' },
            { label: 'Ticket ∅', value: fmt(data.ticketMedioCents), sub: 'por cobro', color: 'text-[#4f72ff]' },
            { label: `${impLabel} total`, value: fmt(data.totalIvaCents), sub: `Base: ${fmt(data.baseImponibleCents)}`, color: 'text-[#f59e0b]' },
            { label: 'Propinas', value: fmt(data.totalPropinaCents), sub: `exento ${impLabel}`, color: 'text-[#e8eaf0]' },
            { label: 'Turnos', value: String(data.numTurnos), sub: data.duracionMediaMinutos !== null ? `∅ ${Math.floor(data.duracionMediaMinutos / 60)}h ${data.duracionMediaMinutos % 60}m` : '—', color: 'text-[#e8eaf0]' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-[#6b7280] mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Gráfico por hora + Split pago */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="col-span-2 bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Ventas por hora</p>
            <div className="h-40">
              {activeHours.length > 0
                ? <TpvBarChart data={chartData} />
                : <p className="text-center text-[#6b7280] text-sm py-12">Sin datos en este período</p>
              }
            </div>
          </div>
          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Método de pago</p>
            <div className="flex flex-col gap-4">
              {[
                { label: 'Efectivo', cents: data.splitEfectivoCents, pct: pctEfectivo, color: '#22c55e' },
                { label: 'Tarjeta', cents: data.splitTarjetaCents, pct: 100 - pctEfectivo, color: '#4f72ff' },
              ].map(m => (
                <div key={m.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: m.color }}>{m.label}</span>
                    <span className="text-xs text-[#e8eaf0]">{fmt(m.cents)}</span>
                  </div>
                  <div className="bg-[#2e3347] rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                  <span className="text-[10px] text-[#6b7280]">{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top productos + Historial turnos */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Productos más vendidos</p>
            {data.topProductos.length === 0
              ? <p className="text-[#6b7280] text-sm">Sin datos</p>
              : (
                <div className="flex flex-col gap-2">
                  {data.topProductos.map((p, i) => (
                    <div key={p.nombre} className="flex items-center gap-3">
                      <span
                        className="text-[9px] font-bold w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{
                          background: i < 3 ? '#4f72ff' : '#2e3347',
                          color: i < 3 ? 'white' : '#6b7280',
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm text-[#c8cad4] flex-1 truncate">{p.nombre}</span>
                      <span className="text-xs text-[#6b7280] shrink-0">× {p.cantidad}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Turnos del período</p>
            {data.historialTurnos.length === 0
              ? <p className="text-[#6b7280] text-sm">Sin turnos</p>
              : (
                <div className="flex flex-col gap-2">
                  {data.historialTurnos.map(t => (
                    <div key={t.id} className="bg-[#22263a] rounded-lg px-3 py-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-[#e8eaf0]">{t.operadorNombre}</span>
                        {t.activo
                          ? <span className="text-[10px] text-[#4f72ff] font-bold">● En curso</span>
                          : <span className="text-sm font-bold text-[#22c55e]">{fmt(t.totalCents)}</span>
                        }
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#6b7280]">
                          {fmtTime(t.aperturaAt)}{t.cierreAt !== null ? ` → ${fmtTime(t.cierreAt)}` : ''} · {fmtDate(t.aperturaAt)}
                        </span>
                        <span className="text-[10px] text-[#6b7280]">{t.numCobros} cobros</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

      </div>
    </div>
  );
}
