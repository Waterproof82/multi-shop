'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { FichajeConEstado } from '@/core/laborcontrol/application/use-cases/ObtenerMisFichajes.usecase';
import type { ReviewQueueItem } from '@/core/laborcontrol/domain/types';
import { getCsrfToken } from '@/lib/csrf-client';

export const dynamic = 'force-dynamic';

const INACTIVITY_MS = 60_000; // 60 s

const TIPO_LABEL: Record<string, string> = {
  entrada:      'Entrada',
  salida:       'Salida',
  inicio_pausa: 'Inicio pausa',
  fin_pausa:    'Fin pausa',
  correccion:   'Corrección',
};

const REVISION_LABEL: Record<string, string> = {
  orphan:        'Evento sin par — requiere corrección',
  drift:         'Desfase de reloj detectado',
  sync_failed:   'Sincronización fallida',
  ack_pendiente: 'Corrección aplicada — revisar',
  disputa:       'Disputa registrada',
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
  const [fichajes, setFichajes]     = useState<FichajeConEstado[]>([]);
  const [notifs, setNotifs]         = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
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
    const [fichajesRes, notifsRes] = await Promise.all([
      fetch(`/api/laborcontrol/fichajes/${eId}?from=${from}&to=${to}`),
      fetch('/api/laborcontrol/review-queue'),
    ]);
    if (fichajesRes.ok) setFichajes(await fichajesRes.json() as FichajeConEstado[]);
    else setError('No se pudieron cargar los fichajes');
    if (notifsRes.ok) setNotifs(await notifsRes.json() as ReviewQueueItem[]);
    setLoading(false);
  }, []);

  const markNotif = useCallback(async (id: string, estado: 'visto' | 'disputado') => {
    const csrfToken = getCsrfToken();
    const res = await fetch(`/api/laborcontrol/review-queue/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ estado }),
    });
    if (res.ok) {
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, estado } : n));
    }
  }, []);

  useEffect(() => {
    if (empleadoId) void fetchFichajes(empleadoId);
  }, [empleadoId, fetchFichajes]);

  if (loading) return <div className="p-6 text-sm text-[#6b7280]">Cargando...</div>;
  if (error !== null) return <div className="p-6 text-sm text-red-500">{error}</div>;

  const pendingNotifs = notifs.filter(n => n.estado === 'pendiente');

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

      {/* LC-K-004: Notificaciones pendientes de revisión */}
      {pendingNotifs.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            Notificaciones ({pendingNotifs.length})
          </span>
          {pendingNotifs.map(n => (
            <div
              key={n.id}
              className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 flex flex-col gap-2"
            >
              <p className="text-sm font-medium text-amber-800">
                {REVISION_LABEL[n.tipoRevision] ?? n.tipoRevision}
              </p>
              {typeof n.detalle.mensaje === 'string' && (
                <p className="text-xs text-amber-700">{n.detalle.mensaje}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void markNotif(n.id, 'visto')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  Visto
                </button>
                <button
                  type="button"
                  onClick={() => void markNotif(n.id, 'disputado')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Disputar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
