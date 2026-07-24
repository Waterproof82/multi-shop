'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { FichajeConEstado } from '@/core/laborcontrol/application/use-cases/ObtenerMisFichajes.usecase';

export const dynamic = 'force-dynamic';

const INACTIVITY_MS = 60_000; // 60 s

const TIPO_LABEL: Record<string, string> = {
  entrada:      'Entrada',
  salida:       'Salida',
  inicio_pausa: 'Inicio pausa',
  fin_pausa:    'Fin pausa',
  correccion:   'Corrección',
};

function getDateRange(): { from: string; to: string } {
  const today = new Date();
  const from  = new Date(today);
  from.setDate(today.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to:   today.toISOString().slice(0, 10),
  };
}

export default function MisFichajesPage() {
  const router = useRouter();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fichajes, setFichajes] = useState<FichajeConEstado[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);

  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      router.push('/tpv/mostrador');
    }, INACTIVITY_MS);
  }, [router]);

  // Inactivity timer
  useEffect(() => {
    resetTimer();
    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [resetTimer]);

  // Fetch employee ID from /api/tpv/me
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/tpv/me');
      if (!res.ok) { router.push('/tpv/login'); return; }
      const data = await res.json() as { rol?: string; isEmployeeSession?: boolean; empleadoId?: string };
      if (!data.isEmployeeSession || !data.empleadoId) { router.push('/tpv/login'); return; }
      setEmpleadoId(data.empleadoId);
    })();
  }, [router]);

  const fetchFichajes = useCallback(async (eId: string) => {
    const { from, to } = getDateRange();
    const res = await fetch(`/api/laborcontrol/fichajes/${eId}?from=${from}&to=${to}`);
    if (res.ok) {
      setFichajes(await res.json() as FichajeConEstado[]);
    } else {
      setError('No se pudieron cargar los fichajes');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (empleadoId) void fetchFichajes(empleadoId);
  }, [empleadoId, fetchFichajes]);

  if (loading) return <div className="p-6 text-sm text-[#6b7280]">Cargando...</div>;
  if (error !== null) return <div className="p-6 text-sm text-red-500">{error}</div>;

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">Mis fichajes</span>
          <h1 className="text-xl font-bold">Últimos 30 días</h1>
        </div>
        <button
          type="button"
          onClick={() => router.push('/tpv/mostrador')}
          className="text-sm text-[#64748b] hover:text-[#0f172a] underline"
        >
          Volver
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {fichajes.map(f => (
          <div
            key={f.recordId}
            className={`border rounded-xl px-4 py-3 flex justify-between items-center ${
              f.superseded ? 'border-[#fecaca] bg-[#fef2f2] opacity-60' : 'border-[#e2e8f0] bg-white'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {TIPO_LABEL[f.tipo] ?? f.tipo}
                {f.superseded && <span className="ml-2 text-xs text-red-400">(anulado)</span>}
              </span>
              <span className="text-xs text-[#6b7280]">
                {new Date(f.timestampEvento).toLocaleString('es-ES')}
              </span>
            </div>
            {f.origenOffline && (
              <span className="text-xs text-amber-600 border border-amber-200 rounded px-1.5 py-0.5">
                Offline
              </span>
            )}
          </div>
        ))}
        {fichajes.length === 0 && (
          <p className="text-sm text-[#6b7280] text-center py-8">
            No hay fichajes en los últimos 30 días.
          </p>
        )}
      </div>
    </div>
  );
}
