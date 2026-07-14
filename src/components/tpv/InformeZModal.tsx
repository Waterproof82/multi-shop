'use client';

import { useEffect } from 'react';
import type { InformeZData } from '@/core/domain/entities/tpv-types';

interface Props {
  informe: InformeZData;
  onClose: () => void;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitHash(hash: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < hash.length; i += 16) {
    chunks.push(hash.slice(i, i + 16));
  }
  return chunks;
}

export function InformeZModal({ informe, onClose }: Readonly<Props>) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, []);

  const impuestoLabel = informe.tipoImpuesto === 'igic' ? 'IGIC' : 'IVA';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 print:bg-white print:inset-auto print:relative">
      <div className="bg-white text-black w-full max-w-sm mx-4 rounded-lg p-6 font-mono text-sm print:rounded-none print:shadow-none print:p-0 print:max-w-full">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="font-bold text-base">{informe.empresaNombre}</div>
          {informe.empresaNif && <div className="text-xs">{informe.empresaNif}</div>}
        </div>

        <div className="border-t border-b border-black py-1 text-center font-bold my-2">
          INFORME Z Nº {String(informe.numeroZ).padStart(5, '0')}
        </div>

        {/* Turno info */}
        <div className="mb-2 text-xs space-y-0.5">
          <div>Apertura:  {formatDateTime(informe.aperturaAt)}</div>
          <div>Cierre:    {formatDateTime(informe.cierreAt)}</div>
          <div>Operador:  {informe.operadorNombre}</div>
        </div>

        <div className="border-t border-black my-2" />

        {/* Ventas */}
        <div className="font-bold text-xs mb-1">VENTAS</div>
        {informe.desglosePagos.map(p => (
          <div key={p.metodoPago} className="flex justify-between text-xs">
            <span>{p.metodoPago === 'efectivo' ? 'Efectivo:' : 'Tarjeta:'}</span>
            <span>{formatCents(p.totalCents)}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs">
          <span>Nº operaciones:</span>
          <span>{informe.numCobros}</span>
        </div>

        <div className="border-t border-black my-2" />

        {/* Fiscalidad */}
        <div className="font-bold text-xs mb-1">FISCALIDAD ({impuestoLabel})</div>
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between">
            <span>Base imponible:</span>
            <span>{formatCents(informe.baseImponibleCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cuota {impuestoLabel}:</span>
            <span>{formatCents(informe.ivaCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Propinas (exento):</span>
            <span>{formatCents(informe.propinaCents)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>TOTAL:</span>
            <span>{formatCents(informe.totalFacturadoCents)}</span>
          </div>
        </div>

        <div className="border-t border-black my-2" />

        {/* Arqueo de caja */}
        <div className="font-bold text-xs mb-1">ARQUEO DE CAJA</div>
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between">
            <span>Fondo apertura:</span>
            <span>{formatCents(informe.efectivoAperturaCents)}</span>
          </div>
          {informe.movimientos
            .filter(m => m.tipoEvento === 'entrada_caja' || m.tipoEvento === 'salida_caja')
            .map(m => (
              <div key={m.id} className="flex justify-between">
                <span>{m.tipoEvento === 'entrada_caja' ? '+' : '-'} {m.descripcion}</span>
                <span>{formatCents(m.montoCents ?? 0)}</span>
              </div>
            ))}
          <div className="flex justify-between">
            <span>Efectivo teórico:</span>
            <span>{formatCents(informe.efectivoCierreTeoricoCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Efectivo contado:</span>
            <span>{formatCents(informe.efectivoCierreCents)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Descuadre:</span>
            <span>{formatCents(informe.diferenciaCents)}</span>
          </div>
        </div>

        <div className="border-t border-black my-2" />

        {/* Hash */}
        <div className="font-bold text-xs mb-1">HUELLA DIGITAL</div>
        <div className="text-xs break-all text-gray-600">
          {splitHash(informe.hashEncadenado).map((chunk, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i}>{chunk}</div>
          ))}
        </div>

        {/* Actions — hidden in print */}
        <div className="mt-4 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-[#1a1d27] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[#2e3347] transition-colors"
          >
            Finalizar turno
          </button>
        </div>
      </div>
    </div>
  );
}
