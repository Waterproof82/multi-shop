'use client';

import type { MetodoPago, TpvCobro } from '@/core/domain/entities/tpv-types';
import { usePrinter } from '@/hooks/tpv/usePrinter';
import type { PrintTicket } from '@/lib/tpv/printer';

interface Props {
  readonly totalFinalCents: number;
  readonly metodo: MetodoPago;
  readonly entregadoCents: number;
  readonly propinaCents: number;
  readonly descuentoCents: number;
  readonly mesaNumero: number;
  readonly operadorNombre: string;
  readonly empresaNombre: string;
  readonly cobro: TpvCobro | null;
  readonly empresaNif: string | null;
  readonly tipoImpuesto: 'iva' | 'igic';
  readonly esParcial?: boolean;
  readonly esOffline?: boolean;
  readonly pendienteCents?: number;
  readonly onNuevaOperacion: () => void;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

function buildAeatUrl(nif: string, cobro: TpvCobro): string {
  // AEAT requiere DD-MM-AAAA
  const [yyyy, mm, dd] = cobro.cobradoAt.slice(0, 10).split('-');
  const fecha = `${dd}-${mm}-${yyyy}`;
  const importe = (cobro.importeCobradoCents / 100).toFixed(2);
  const serie = `${cobro.serie}${String(cobro.numeroTicket).padStart(6, '0')}`;
  const params = new URLSearchParams({ nif, numserie: serie, fecha, importe });
  return `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`;
}

export function CobroConfirmado({
  totalFinalCents,
  metodo,
  entregadoCents,
  propinaCents,
  descuentoCents,
  mesaNumero,
  operadorNombre,
  empresaNombre,
  cobro,
  empresaNif,
  tipoImpuesto,
  esParcial = false,
  esOffline = false,
  pendienteCents = 0,
  onNuevaOperacion,
}: Props) {
  const { print, isPrinting, printError } = usePrinter();
  const now = new Date();
  const hora =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const cambio = metodo === 'efectivo' ? Math.max(0, entregadoCents - totalFinalCents) : 0;

  function buildTicket(): PrintTicket | null {
    if (cobro === null) return null;
    return {
      empresaNombre,
      empresaNif,
      mesaNumero,
      operadorNombre,
      serie: cobro.serie,
      numeroTicket: cobro.numeroTicket,
      hash: cobro.hash,
      metodoPago: metodo,
      importeCobradoCents: totalFinalCents,
      propinaCents,
      baseImponibleCents: cobro.baseImponibleCents,
      ivaPorcentaje: cobro.ivaPorcentaje,
      ivaCents: cobro.ivaCents,
      cobradoAt: cobro.cobradoAt,
      entregadoCents,
      tipoImpuesto,
    };
  }

  function handlePrint() {
    const ticket = buildTicket();
    if (ticket === null) return;
    void print(ticket);
  }

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl border-2 ${esOffline ? 'bg-[#f59e0b22] border-[#f59e0b]' : esParcial ? 'bg-[#f9731622] border-[#f97316]' : 'bg-[#22c55e22] border-[#22c55e]'}`}>
          {esOffline ? '~' : esParcial ? '½' : '✓'}
        </div>
        <h2 className="text-2xl font-bold">{esOffline ? 'Cobro en cola offline' : esParcial ? 'Cobro parcial registrado' : '¡Cobrado!'}</h2>
        {esOffline && (
          <p className="text-xs text-[#f59e0b] text-center">
            Sin conexión — se sincronizará automáticamente al recuperar la red.
          </p>
        )}
        <p className="text-sm text-[#6b7280]">
          Mesa {mesaNumero} · {operadorNombre}
        </p>
        {esParcial && pendienteCents > 0 && (
          <p className="text-sm text-[#f97316] font-semibold">
            Pendiente: {fmt(pendienteCents)}
          </p>
        )}

        {/* Ticket header */}
        {cobro !== null && (
          <div className="w-full flex items-center justify-between px-1">
            <span className="text-xs text-[#6b7280]">
              Ticket {cobro.serie}-{String(cobro.numeroTicket).padStart(6, '0')}
            </span>
            <span className="text-xs font-mono text-[#4b5563]" title="Hash de integridad">
              #{cobro.hash.slice(0, 8)}
            </span>
          </div>
        )}

        <div className="w-full bg-[#22263a] border border-[#2e3347] rounded-xl p-5 flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7280]">Total cobrado</span>
            <span className="font-semibold">{fmt(totalFinalCents)}</span>
          </div>
          {descuentoCents > 0 && (
            <div className="flex justify-between text-sm text-[#ef4444]">
              <span>Descuento aplicado</span>
              <span>− {fmt(descuentoCents)}</span>
            </div>
          )}
          {propinaCents > 0 && (
            <div className="flex justify-between text-sm text-[#eab308] font-semibold">
              <span>Propina registrada</span>
              <span>{fmt(propinaCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7280]">Método</span>
            <span className="capitalize font-semibold">{metodo}</span>
          </div>
          {metodo === 'efectivo' && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[#6b7280]">Entregado</span>
                <span>{fmt(entregadoCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6b7280]">Cambio devuelto</span>
                <span>{fmt(cambio)}</span>
              </div>
            </>
          )}

          {/* Item lines — shown when detalleItems is available */}
          {cobro?.detalleItems && cobro.detalleItems.length > 0 && (
            <div className="border-t border-[#2e3347] pt-3">
              {cobro.detalleItems.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-[#9ca3af]">
                  <span>{item.cantidad}x {item.nombre}</span>
                  <span>{((item.precioUnitarioCents * item.cantidad) / 100).toFixed(2).replace('.', ',')} €</span>
                </div>
              ))}
            </div>
          )}

          {/* IVA breakdown — shown when cobro is available */}
          {cobro !== null && (
            <>
              <div className="h-px bg-[#2e3347]" />
              <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Desglose {tipoImpuesto.toUpperCase()}</p>
              <div className="flex justify-between text-xs text-[#6b7280]">
                <span>Base imponible ({cobro.ivaPorcentaje}% {tipoImpuesto.toUpperCase()})</span>
                <span>{fmt(cobro.baseImponibleCents)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#6b7280]">
                <span>{tipoImpuesto.toUpperCase()} {cobro.ivaPorcentaje}%</span>
                <span>{fmt(cobro.ivaCents)}</span>
              </div>
              {propinaCents > 0 && (
                <div className="flex justify-between text-xs text-[#6b7280]">
                  <span>Propina (exenta)</span>
                  <span>{fmt(propinaCents)}</span>
                </div>
              )}
            </>
          )}

          <div className="h-px bg-[#2e3347]" />
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7280]">Hora</span>
            <span>{hora}</span>
          </div>
        </div>

        {/* AEAT verification URL */}
        {cobro !== null && empresaNif !== null && empresaNif !== '' && (
          <div className="w-full bg-[#0f1117] border border-[#2e3347] rounded-xl p-3 flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">
              Verificación AEAT
            </p>
            <a
              href={buildAeatUrl(empresaNif, cobro)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#4f72ff] break-all hover:underline leading-relaxed"
            >
              {buildAeatUrl(empresaNif, cobro)}
            </a>
          </div>
        )}
        {cobro !== null && (empresaNif === null || empresaNif === '') && (
          <p className="text-xs text-[#6b7280] text-center">
            Configure el NIF en Ajustes para activar la verificación AEAT.
          </p>
        )}

        <div className="flex gap-3 w-full">
          <button
            type="button"
            disabled={cobro === null || isPrinting}
            onClick={handlePrint}
            className="flex-1 py-3 rounded-xl border border-[#2e3347] text-sm font-semibold hover:border-[#e8eaf0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPrinting ? '...' : 'Imprimir'}
          </button>
          <button
            type="button"
            onClick={onNuevaOperacion}
            className="flex-[2] py-3 rounded-xl bg-[#4f72ff] text-white font-bold hover:brightness-110 transition-all"
          >
            {esParcial ? 'Volver al mostrador →' : 'Cerrar mesa →'}
          </button>
        </div>
        {!esParcial && !esOffline && (
          <p className="text-xs text-[#6b7280] text-center">
            La sesión de mesa se ha cerrado automáticamente al cobrar.
          </p>
        )}
        {printError !== null && (
          <p className="text-xs text-[#ef4444] text-center">{printError}</p>
        )}
      </div>
    </div>
  );
}
