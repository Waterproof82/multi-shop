'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Download } from 'lucide-react';
import type { TpvAnalytics, TipoImpuesto } from '@/core/domain/entities/tpv-types';

// DOW 0=domingo…6=sábado (PostgreSQL). Reordenamos a lun-dom para la UI.
const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Mapeo de índice UI (0=lun) → DOW PostgreSQL
function uiToDow(ui: number): number { return ui === 6 ? 0 : ui + 1; }

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

function calcPrevDesdeHasta(periodo: Periodo, desde: string, hasta: string): [string, string] | null {
  if (periodo === 'custom') return null;
  const d = new Date(desde);
  const h = new Date(hasta);
  const diffMs = h.getTime() - d.getTime();
  const prev = new Date(d.getTime() - diffMs - 86_400_000);
  const prevH = new Date(d.getTime() - 86_400_000);
  return [toDateStr(prev), toDateStr(prevH)];
}

function delta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function periodoLabel(p: Periodo): string {
  if (p === 'semana') return 'Semana';
  if (p === 'custom') return 'Custom';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function buildDailySummaryHtml(data: TpvAnalytics, tipoImpuesto: TipoImpuesto, periodoLabel: string): string {
  const imp = tipoImpuesto.toUpperCase();
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
  const topRows = data.topProductos.slice(0, 10).map((p, i) =>
    `<tr><td>${i + 1}</td><td>${p.nombre}</td><td style="text-align:right">${p.cantidad}</td></tr>`
  ).join('');
  const turnoRows = data.historialTurnos.map(t => {
    const apertura = new Date(t.aperturaAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const cierre = t.cierreAt ? new Date(t.cierreAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'En curso';
    return `<tr><td>${t.operadorNombre}</td><td>${apertura} → ${cierre}</td><td style="text-align:right">${t.numCobros}</td><td style="text-align:right">${fmt(t.totalCents)}</td></tr>`;
  }).join('');
  const horaRows = data.ventasPorHora
    .map((v, h) => ({ h, v }))
    .filter(x => x.v > 0)
    .map(x => `<tr><td>${x.h}:00</td><td style="text-align:right">${fmt(x.v)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Informe ${periodoLabel}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  .meta { color: #666; font-size: 10px; margin-bottom: 16px; }
  .kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 16px; }
  .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
  .kpi-label { font-size: 9px; text-transform: uppercase; color: #888; }
  .kpi-value { font-size: 18px; font-weight: bold; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f4f4f4; text-align: left; padding: 4px 6px; }
  td { padding: 3px 6px; border-bottom: 1px solid #eee; }
  .footer { margin-top: 20px; font-size: 9px; color: #aaa; text-align: center; }
</style></head><body>
<h1>Informe de actividad — ${periodoLabel}</h1>
<p class="meta">Generado el ${now}</p>

<div class="kpis">
  <div class="kpi"><div class="kpi-label">Facturado</div><div class="kpi-value">${fmt(data.totalFacturadoCents)}</div><div class="kpi-label">${data.numCobros} cobros · ticket ∅ ${fmt(data.ticketMedioCents)}</div></div>
  <div class="kpi"><div class="kpi-label">${imp} total</div><div class="kpi-value">${fmt(data.totalIvaCents)}</div><div class="kpi-label">Base imponible: ${fmt(data.baseImponibleCents)}</div></div>
  <div class="kpi"><div class="kpi-label">Propinas</div><div class="kpi-value">${fmt(data.totalPropinaCents)}</div><div class="kpi-label">Efectivo: ${fmt(data.splitEfectivoCents)} · Tarjeta: ${fmt(data.splitTarjetaCents)}</div></div>
</div>

<h2>Turnos</h2>
<table><thead><tr><th>Operador</th><th>Horario</th><th style="text-align:right">Cobros</th><th style="text-align:right">Total</th></tr></thead><tbody>${turnoRows || '<tr><td colspan="4">Sin turnos</td></tr>'}</tbody></table>

<h2>Ventas por hora</h2>
<table><thead><tr><th>Hora</th><th style="text-align:right">Importe</th></tr></thead><tbody>${horaRows || '<tr><td colspan="2">Sin datos</td></tr>'}</tbody></table>

<h2>Productos más vendidos</h2>
<table><thead><tr><th>#</th><th>Producto</th><th style="text-align:right">Uds.</th></tr></thead><tbody>${topRows || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody></table>

<p class="footer">Documento generado automáticamente por el TPV · No válido como factura</p>
</body></html>`;
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
  const [prevData, setPrevData] = useState<TpvAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const impLabel = tipoImpuesto.toUpperCase();

  async function fetchData(p: Periodo, cd: string, ch: string) {
    const [desde, hasta] = calcDesdeHasta(p, cd, ch);
    const prevRange = calcPrevDesdeHasta(p, desde, hasta);
    setLoading(true);
    try {
      const [res, prevRes] = await Promise.all([
        fetch(`/api/tpv/analytics?desde=${desde}&hasta=${hasta}`),
        prevRange ? fetch(`/api/tpv/analytics?desde=${prevRange[0]}&hasta=${prevRange[1]}`) : Promise.resolve(null),
      ]);
      if (res.ok) setData(await res.json() as TpvAnalytics);
      if (prevRes?.ok) setPrevData(await prevRes.json() as TpvAnalytics);
      else setPrevData(null);
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

  function exportPdf() {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(buildDailySummaryHtml(data, tipoImpuesto, periodoLabel(periodo)));
    win.document.close();
    win.focus();
    win.print();
  }

  const totalBruto = data.splitEfectivoCents + data.splitTarjetaCents;
  const pctEfectivo = totalBruto > 0 ? Math.round((data.splitEfectivoCents / totalBruto) * 100) : 0;

  // Heatmap: máximo valor para escala de color
  const heatmapMax = data.heatmap.reduce((m, r) => Math.max(m, r.totalCents), 1);
  const heatmapMap = new Map(data.heatmap.map(r => [`${r.dow}-${r.hora}`, r.totalCents]));
  const activeHoursHeatmap = data.heatmap.length > 0
    ? { min: Math.min(...data.heatmap.map(r => r.hora)), max: Math.max(...data.heatmap.map(r => r.hora)) }
    : { min: 8, max: 22 };

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
            <button
              type="button"
              onClick={exportPdf}
              title="Exportar informe PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d27] border border-[#2e3347] text-xs text-[#6b7280] hover:text-white hover:border-[#4f72ff] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
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
            { label: 'Facturado', value: fmt(data.totalFacturadoCents), prev: prevData?.totalFacturadoCents, sub: `${data.numCobros} cobros`, color: 'text-[#e8eaf0]' },
            { label: 'Ticket ∅', value: fmt(data.ticketMedioCents), prev: prevData?.ticketMedioCents, sub: 'por cobro', color: 'text-[#4f72ff]' },
            { label: `${impLabel} total`, value: fmt(data.totalIvaCents), prev: prevData?.totalIvaCents, sub: `Base: ${fmt(data.baseImponibleCents)}`, color: 'text-[#f59e0b]' },
            { label: 'Propinas', value: fmt(data.totalPropinaCents), prev: prevData?.totalPropinaCents, sub: `exento ${impLabel}`, color: 'text-[#e8eaf0]' },
            { label: 'Turnos', value: String(data.numTurnos), prev: prevData?.numTurnos, sub: data.duracionMediaMinutos !== null ? `∅ ${Math.floor(data.duracionMediaMinutos / 60)}h ${data.duracionMediaMinutos % 60}m` : '—', color: 'text-[#e8eaf0]' },
          ].map(kpi => {
            // Para los que son cents, necesitamos el valor numérico
            const currNum = kpi.label === 'Facturado' ? data.totalFacturadoCents
              : kpi.label === 'Ticket ∅' ? data.ticketMedioCents
              : kpi.label.includes(impLabel) ? data.totalIvaCents
              : kpi.label === 'Propinas' ? data.totalPropinaCents
              : data.numTurnos;
            const d2 = kpi.prev !== undefined ? delta(currNum, kpi.prev) : null;
            return (
              <div key={kpi.label} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3">
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-[10px] text-[#6b7280]">{kpi.sub}</p>
                  {d2 !== null && (
                    <span className={`text-[10px] font-semibold ${d2 >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {d2 >= 0 ? '↑' : '↓'}{Math.abs(d2)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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

        {/* Heatmap ventas por día × hora */}
        {data.heatmap.length > 0 && (
          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Mapa de calor · día × hora</p>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="w-6" />
                    {Array.from({ length: activeHoursHeatmap.max - activeHoursHeatmap.min + 1 }, (_, i) => (
                      <th key={i} className="text-[9px] text-[#6b7280] font-normal w-6 text-center">
                        {activeHoursHeatmap.min + i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DOW_LABELS.map((label, uiIdx) => {
                    const dow = uiToDow(uiIdx);
                    return (
                      <tr key={label}>
                        <td className="text-[9px] text-[#6b7280] pr-1 text-right">{label}</td>
                        {Array.from({ length: activeHoursHeatmap.max - activeHoursHeatmap.min + 1 }, (_, i) => {
                          const hora = activeHoursHeatmap.min + i;
                          const val = heatmapMap.get(`${dow}-${hora}`) ?? 0;
                          const intensity = val / heatmapMax;
                          return (
                            <td
                              key={hora}
                              title={val > 0 ? fmt(val) : '—'}
                              className="w-6 h-6 rounded-sm"
                              style={{ background: val === 0 ? '#1e2235' : `rgba(79,114,255,${0.15 + intensity * 0.85})` }}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
