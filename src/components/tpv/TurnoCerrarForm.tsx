'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TpvTurno, TpvTurnoStats, InformeZData } from '@/core/domain/entities/tpv-types';
import { getCsrfToken, fetchWithCsrf } from '@/lib/csrf-client';
import { useTpvCatalog } from '@/lib/tpv-catalog-ctx';
import { useTpvIsEmployeeSession } from '@/lib/tpv-rol-ctx';
import { InformeZModal } from '@/components/tpv/InformeZModal';
import { logClientError } from '@/lib/client-error';

interface MesaAbierta {
  mesaNumero: number | null;
  mesaNombre: string | null;
}

interface Props {
  readonly turno: TpvTurno;
  readonly stats: TpvTurnoStats;
  readonly mesasAbiertas: MesaAbierta[];
  readonly isBlindClose: boolean;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

function getDiferenciaColorClass(diferenciaCents: number): string {
  if (diferenciaCents === 0) return 'text-[#22c55e]';
  if (diferenciaCents > 0) return 'text-[#eab308]';
  return 'text-[#ef4444]';
}

function getDiferenciaBoxClass(diferenciaCents: number): string {
  if (diferenciaCents === 0) return 'bg-[#22c55e15] border-[#22c55e44]';
  if (Math.abs(diferenciaCents) < 100) return 'bg-[#eab30815] border-[#eab30844]';
  return 'bg-[#ef444415] border-[#ef444444]';
}

function getDiferenciaLabel(diferenciaCents: number): string {
  if (diferenciaCents === 0) return 'Cuadra perfectamente';
  if (diferenciaCents > 0) return 'Sobrante';
  return 'Faltante';
}

export function TurnoCerrarForm({ turno, stats, mesasAbiertas, isBlindClose }: Readonly<Props>) {
  const router = useRouter();
  const { setTurno } = useTpvCatalog();
  const isEmployeeSession = useTpvIsEmployeeSession();
  const [efectivoContado, setEfectivoContado] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informeZ, setInformeZ] = useState<InformeZData | null>(null);

  const contadoCents = Math.round(parseFloat(efectivoContado || '0') * 100);
  const teoricoCents = turno.efectivoAperturaCents + stats.totalEfectivoCents;
  const diferenciaCents = contadoCents - teoricoCents;
  const hasContado = efectivoContado.trim() !== '';
  const hayMesasAbiertas = mesasAbiertas.length > 0;

  const apertura = new Date(turno.aperturaAt);
  const [duracion] = useState(() =>
    Math.round((new Date().getTime() - apertura.getTime()) / 60_000)
  );

  async function handleCierre(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/tpv/turno/${turno.id}/cerrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(
          isBlindClose
            ? { efectivoCierreCents: contadoCents }
            : { efectivoCierreCents: contadoCents, totalEfectivoTeoricoCents: teoricoCents },
        ),
      });

      if (res.ok) {
        setTurno(null);
        if (isEmployeeSession) {
          await fetchWithCsrf('/api/tpv/empleados/logout', { method: 'POST' });
        }
        const zRes = await fetch(`/api/tpv/turno/${turno.id}/informe-z`);
        if (zRes.ok) {
          const data = (await zRes.json()) as InformeZData;
          const snapshotPromise = window.electronAPI?.saveFiscalSnapshot(data);
          if (snapshotPromise !== undefined) {
            snapshotPromise
              .then(result => {
                if (!result.success) {
                  logClientError(new Error(result.error ?? 'Backup fiscal local fallido'), 'saveFiscalSnapshot');
                }
              })
              .catch(err => { logClientError(err, 'saveFiscalSnapshot'); });
          }
          setInformeZ(data);
        } else {
          router.push(isEmployeeSession ? '/tpv/login' : '/tpv/turno/abrir');
        }
      } else {
        let msg = 'Error al cerrar el turno. Inténtalo de nuevo.';
        try {
          const err = (await res.json()) as { error?: string };
          if (typeof err.error === 'string') msg = err.error;
        } catch { /* usa msg por defecto */ }
        setError(msg);
      }
    } catch {
      setError('Sin conexión. Comprueba la red e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function handleInformeZClose() {
    router.push(isEmployeeSession ? '/tpv/login' : `/tpv/analytics/cierre/${turno.id}`);
  }

  if (informeZ !== null) {
    return <InformeZModal informe={informeZ} onClose={handleInformeZClose} />;
  }

  return (
    <form onSubmit={handleCierre} className="flex flex-col gap-6 w-full">
      {/* Resumen */}
      <div className="bg-[#22263a] border border-[#2e3347] rounded-xl p-5 flex flex-col gap-3">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Resumen del turno</p>
        <div className="flex justify-between text-sm">
          <span className="text-[#6b7280]">Operador</span>
          <span>{turno.operadorNombre}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#6b7280]">Apertura</span>
          <span>{apertura.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#6b7280]">Duración</span>
          <span>{duracion} min</span>
        </div>
        {!isBlindClose && (
          <>
            <div className="h-px bg-[#2e3347]" />
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7280]">Total efectivo (teórico)</span>
              <span className="font-semibold">
                {hasContado ? fmt(teoricoCents) : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#6b7280]">Total tarjeta</span>
              <span className="font-semibold">{fmt(stats.totalTarjetaCents)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>TOTAL TURNO</span>
              <span>{fmt(teoricoCents + stats.totalTarjetaCents)}</span>
            </div>
          </>
        )}
      </div>

      {/* Arqueo ciego */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">
          Cuenta el efectivo sin mirar el sistema
        </label>
        <div className="flex items-center gap-2 bg-[#22263a] border border-[#2e3347] rounded-xl px-4 focus-within:border-[#4f72ff] transition-colors">
          <span className="text-[#6b7280] font-semibold">€</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={efectivoContado}
            onChange={e => setEfectivoContado(e.target.value)}
            className="flex-1 bg-transparent py-3.5 text-lg font-bold outline-none"
            placeholder="0,00"
            autoFocus
          />
        </div>
      </div>

      {/* Diferencia en tiempo real */}
      {hasContado && !isBlindClose && (
        <div className={`rounded-xl p-4 border ${getDiferenciaBoxClass(diferenciaCents)}`}>
          <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-1">Diferencia</p>
          <p className={`text-2xl font-bold ${getDiferenciaColorClass(diferenciaCents)}`}>
            {diferenciaCents >= 0 ? '+' : ''}{fmt(diferenciaCents)}
          </p>
          <p className="text-xs text-[#6b7280] mt-1">
            {getDiferenciaLabel(diferenciaCents)}
          </p>
        </div>
      )}

      {hayMesasAbiertas && (
        <div className="bg-[#f9731615] border border-[#f9731640] rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-[#f97316]">
            Hay {mesasAbiertas.length} {mesasAbiertas.length === 1 ? 'mesa sin cobrar' : 'mesas sin cobrar'}
          </p>
          <ul className="flex flex-col gap-0.5">
            {mesasAbiertas.map((m, i) => (
              <li key={i} className="text-xs text-[#f97316]/80">
                {m.mesaNumero !== null ? `Mesa ${m.mesaNumero}` : 'Mesa s/n'}
                {m.mesaNombre ? ` · ${m.mesaNombre}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#f97316]/70 mt-1">
            Cierra o cobra todas las mesas antes de cerrar el turno.
          </p>
        </div>
      )}

      {error !== null && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push('/tpv/mostrador')}
          className="flex-1 py-3.5 rounded-xl border border-[#2e3347] text-[#6b7280] font-semibold hover:text-[#e8eaf0] transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!hasContado || loading || hayMesasAbiertas}
          className="flex-[2] py-3.5 rounded-xl bg-[#ef4444] text-white font-bold disabled:opacity-40 hover:brightness-110 transition-all"
        >
          {loading ? 'Cerrando...' : 'Cerrar turno'}
        </button>
      </div>
    </form>
  );
}
