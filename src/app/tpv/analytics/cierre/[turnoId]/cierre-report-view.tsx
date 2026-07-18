'use client';

import Link from 'next/link';
import type { CierreTurnoReport } from '@/core/domain/entities/analytics-types';
import { PrintButton } from '@/components/analytics/PrintButton';

interface CierreReportViewProps {
  report: CierreTurnoReport;
  empresaNombre: string;
}

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CierreReportView({ report, empresaNombre }: Readonly<CierreReportViewProps>) {
  return (
    <div className="min-h-screen bg-[#0f1117] text-white px-6 py-8 print:bg-white print:text-black">
      <style>{`
        @media print {
          nav, aside, .no-print { display: none !important; }
          body { background: white; color: black; }
        }
      `}</style>

      {/* Header */}
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="border-b border-white/10 print:border-black pb-4">
          <h1 className="text-2xl font-bold">{empresaNombre}</h1>
          <p className="text-sm text-slate-400 print:text-gray-600">Informe de cierre de turno</p>
          <div className="mt-2 text-sm space-y-0.5">
            <p>Operador: <span className="font-medium">{report.operadorNombre}</span></p>
            <p>Apertura: <span className="font-medium">{fmtDateTime(report.abiertaAt)}</span></p>
            {report.cerradaAt !== null && (
              <p>Cierre: <span className="font-medium">{fmtDateTime(report.cerradaAt)}</span></p>
            )}
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total ventas', value: fmtCents(report.totalVentasCents) },
            { label: 'Covers', value: String(report.numCovers) },
            { label: 'Ticket medio', value: fmtCents(report.ticketMedioCents) },
            { label: 'Total mermas', value: fmtCents(report.totalMermasCents) },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white/5 print:bg-gray-50 border border-white/10 print:border-gray-200 rounded-xl p-4"
            >
              <p className="text-xs text-slate-400 print:text-gray-500 uppercase tracking-wide">{kpi.label}</p>
              <p className="text-xl font-bold mt-1">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Payment breakdown */}
        <div className="bg-white/5 print:bg-gray-50 border border-white/10 print:border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-400 print:text-gray-600 uppercase tracking-wider mb-3">
            Desglose de pagos
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Efectivo</span>
              <span className="font-medium">{fmtCents(report.totalEfectivoCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tarjeta</span>
              <span className="font-medium">{fmtCents(report.totalTarjetaCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Propinas</span>
              <span className="font-medium">{fmtCents(report.totalPropinaCents)}</span>
            </div>
          </div>
        </div>

        {/* Top Productos */}
        {report.topProductos.length > 0 && (
          <div className="bg-white/5 print:bg-gray-50 border border-white/10 print:border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-400 print:text-gray-600 uppercase tracking-wider mb-3">
              Top productos
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 print:text-gray-500 border-b border-white/10 print:border-gray-200">
                  <th className="text-left pb-2">Producto</th>
                  <th className="text-right pb-2">Unidades</th>
                  <th className="text-right pb-2">Venta</th>
                </tr>
              </thead>
              <tbody>
                {report.topProductos.map((p) => (
                  <tr key={p.nombre} className="border-b border-white/5 print:border-gray-100">
                    <td className="py-2">{p.nombre}</td>
                    <td className="py-2 text-right">{p.unidades}</td>
                    <td className="py-2 text-right">{fmtCents(p.ventaCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mermas */}
        {report.movimientosStock.length > 0 && (
          <div className="bg-white/5 print:bg-gray-50 border border-white/10 print:border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-400 print:text-gray-600 uppercase tracking-wider mb-3">
              Mermas del turno
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 print:text-gray-500 border-b border-white/10 print:border-gray-200">
                  <th className="text-left pb-2">Ingrediente</th>
                  <th className="text-right pb-2">Cantidad</th>
                  <th className="text-right pb-2">Coste</th>
                </tr>
              </thead>
              <tbody>
                {report.movimientosStock.map((m, idx) => (
                  <tr key={idx} className="border-b border-white/5 print:border-gray-100">
                    <td className="py-2">{m.ingrediente}</td>
                    <td className="py-2 text-right">{m.cantidadMerma}</td>
                    <td className="py-2 text-right">{fmtCents(m.coste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-slate-500 print:text-gray-400 text-center">
          Impreso el {fmtDateTime(new Date().toISOString())}
        </p>

        {/* Actions — hidden in print */}
        <div className="no-print flex gap-3 justify-center pt-2">
          <PrintButton label="Imprimir informe" />
          <Link
            href="/tpv/turno/abrir"
            className="px-4 py-2 rounded-lg bg-[#22263a] border border-[#2e3347] text-slate-300 text-sm font-medium hover:text-white transition-colors"
          >
            Volver al TPV
          </Link>
        </div>
      </div>
    </div>
  );
}
