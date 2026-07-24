'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { FichajeConEstado } from '@/core/laborcontrol/application/use-cases/ObtenerMisFichajes.usecase';
import type { ReviewQueueItem } from '@/core/laborcontrol/domain/types';
import { getCsrfToken } from '@/lib/csrf-client';

export const dynamic = 'force-dynamic';

const INACTIVITY_MS = 60_000;
const RGPD_KEY = (id: string) => `lc_rgpd_v1_${id}`;

type FichajeTipo = 'entrada' | 'salida' | 'inicio_pausa' | 'fin_pausa';

type KioskState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'rgpd'; empleadoId: string; nombre: string; sugerido: FichajeTipo }
  | { phase: 'identify'; empleadoId: string; nombre: string; sugerido: FichajeTipo }
  | { phase: 'fichando' }
  | { phase: 'done'; nombre: string; tipo: FichajeTipo; timestamp: string }
  | { phase: 'error'; message: string }

const TIPO_LABEL: Record<FichajeTipo, string> = {
  entrada:      'Entrada',
  salida:       'Salida',
  inicio_pausa: 'Inicio pausa',
  fin_pausa:    'Fin pausa',
};

const HISTORY_TIPO_LABEL: Record<string, string> = {
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

// Full class strings so Tailwind v4 includes them
const TIPO_BTN_ACTIVE: Record<FichajeTipo, string> = {
  entrada:      'bg-[#f0fdf4] border-[#16a34a] text-[#15803d]',
  salida:       'bg-[#fef2f2] border-[#dc2626] text-[#dc2626]',
  inicio_pausa: 'bg-[#fff7ed] border-[#ea580c] text-[#ea580c]',
  fin_pausa:    'bg-[#eff6ff] border-[#2563eb] text-[#2563eb]',
};

const TIPO_DOT: Record<string, string> = {
  entrada:      'bg-[#16a34a]',
  salida:       'bg-[#dc2626]',
  inicio_pausa: 'bg-[#ea580c]',
  fin_pausa:    'bg-[#2563eb]',
  correccion:   'bg-[#94a3b8]',
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

function formatEvent(ts: Date | string): string {
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function initials(nombre: string): string {
  return nombre.split(' ').map(p => p[0] ?? '').slice(0, 2).join('').toUpperCase();
}

export default function FichajesPage() {
  const router = useRouter();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRef          = useRef<HTMLInputElement>(null);

  // Session
  const [sessionLoading, setSessionLoading] = useState(true);
  const [empleadoId, setEmpleadoId]         = useState<string | null>(null);
  const [empleadoNombre, setEmpleadoNombre] = useState<string | null>(null);

  // Kiosk
  const [pin, setPin]     = useState('');
  const [kiosk, setKiosk] = useState<KioskState>({ phase: 'idle' });

  // History
  const [fichajes, setFichajes]       = useState<FichajeConEstado[]>([]);
  const [notifs, setNotifs]           = useState<ReviewQueueItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Inactivity timer
  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      router.push('/tpv/mostrador');
    }, INACTIVITY_MS);
  }, [router]);

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

  // Load session — admin sessions stay on this page (kiosk only), employee sessions get history too
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/tpv/me');
      if (!res.ok) { router.push('/tpv/login'); return; }
      const data = await res.json() as {
        rol?: string;
        isEmployeeSession?: boolean;
        empleadoId?: string;
        nombre?: string;
      };
      if (!data.rol) { router.push('/tpv/login'); return; }
      if (data.isEmployeeSession && data.empleadoId) {
        setEmpleadoId(data.empleadoId);
        setEmpleadoNombre(data.nombre ?? null);
      }
      setSessionLoading(false);
    })();
  }, [router]);

  // Load personal history when employee session is present
  useEffect(() => {
    if (!empleadoId) return;
    setHistoryLoading(true);
    const { from, to } = getDateRange();
    void Promise.all([
      fetch(`/api/laborcontrol/fichajes/${empleadoId}?from=${from}&to=${to}`),
      fetch('/api/laborcontrol/review-queue'),
    ]).then(async ([fichajesRes, notifsRes]) => {
      if (fichajesRes.ok) setFichajes(await fichajesRes.json() as FichajeConEstado[]);
      if (notifsRes.ok)   setNotifs(await notifsRes.json() as ReviewQueueItem[]);
      setHistoryLoading(false);
    });
  }, [empleadoId]);

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
    if (res.ok) setNotifs(prev => prev.map(n => n.id === id ? { ...n, estado } : n));
  }, []);

  const resetKiosk = useCallback(() => {
    if (successTimer.current) clearTimeout(successTimer.current);
    setKiosk({ phase: 'idle' });
    setPin('');
    setTimeout(() => pinRef.current?.focus(), 50);
  }, []);

  const handleLookup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setKiosk({ phase: 'loading' });

    const csrfToken = getCsrfToken();
    try {
      const res = await fetch('/api/laborcontrol/fichaje/kiosk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setKiosk({ phase: 'error', message: json.error ?? 'PIN incorrecto' });
        return;
      }
      const data = await res.json() as {
        step: 'identify';
        nombre: string;
        empleadoId: string;
        sugerido: FichajeTipo;
      };
      const rgpdAccepted = localStorage.getItem(RGPD_KEY(data.empleadoId));
      if (rgpdAccepted === null) {
        setKiosk({ phase: 'rgpd', empleadoId: data.empleadoId, nombre: data.nombre, sugerido: data.sugerido });
      } else {
        setKiosk({ phase: 'identify', empleadoId: data.empleadoId, nombre: data.nombre, sugerido: data.sugerido });
      }
    } catch {
      setKiosk({ phase: 'error', message: 'Error de red. Inténtalo de nuevo.' });
    }
  }, [pin]);

  const handleFichar = useCallback(async (nombre: string, tipo: FichajeTipo) => {
    setKiosk({ phase: 'fichando' });

    const csrfToken = getCsrfToken();
    try {
      const res = await fetch('/api/laborcontrol/fichaje/kiosk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ pin, tipo }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setKiosk({ phase: 'error', message: json.error ?? 'Error al fichar' });
        return;
      }
      const data = await res.json() as { timestampServidor: string };
      setKiosk({ phase: 'done', nombre, tipo, timestamp: data.timestampServidor });
      successTimer.current = setTimeout(resetKiosk, 3000);
    } catch {
      setKiosk({ phase: 'error', message: 'Error de red. Inténtalo de nuevo.' });
    }
  }, [pin, resetKiosk]);

  if (sessionLoading) {
    return <div className="p-6 text-sm text-[#6b7280]">Cargando...</div>;
  }

  const pendingNotifs = notifs.filter(n => n.estado === 'pendiente');

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">Jornada</span>
        <h1 className="text-xl font-bold text-[#0f172a]">Registro de jornada</h1>
      </div>

      {/* ── Kiosk card ── */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div>
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
            Estación de fichaje
          </p>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Introduce tu PIN para registrar entrada, salida o pausa
          </p>
        </div>

        {/* Idle / loading */}
        {(kiosk.phase === 'idle' || kiosk.phase === 'loading') && (
          <form onSubmit={handleLookup} className="flex gap-3">
            <input
              ref={pinRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="PIN (4–8 dígitos)"
              style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
              className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3.5 text-2xl font-bold text-center tracking-widest outline-none focus:border-[#2563eb] transition-colors placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#94a3b8] text-[#0f172a]"
            />
            <button
              type="submit"
              disabled={pin.length < 4 || kiosk.phase === 'loading'}
              className="px-5 rounded-xl bg-[#2563eb] text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all text-sm shrink-0"
            >
              {kiosk.phase === 'loading' ? '...' : 'Identificar'}
            </button>
          </form>
        )}

        {/* RGPD first-use clause */}
        {kiosk.phase === 'rgpd' && (
          <div className="flex flex-col gap-4">
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-3">
              <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">
                Información de tratamiento — Art. 13 RGPD
              </p>
              <p className="text-sm font-semibold text-[#0f172a]">Hola, {kiosk.nombre}</p>
              <p className="text-sm text-[#374151] leading-relaxed">
                Tu empresa está obligada a registrar tu jornada laboral según el{' '}
                <strong>Art. 34.9 ET</strong> (RD-Ley 8/2019). Los datos registrados
                (entradas, salidas, pausas) se conservan durante <strong>4 años</strong> y
                están a disposición de la Inspección de Trabajo y tu representante sindical.
                Base legal: <strong>Art. 6.1.c RGPD</strong> (obligación legal).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(RGPD_KEY(kiosk.empleadoId), '1');
                setKiosk({
                  phase: 'identify',
                  empleadoId: kiosk.empleadoId,
                  nombre: kiosk.nombre,
                  sugerido: kiosk.sugerido,
                });
              }}
              className="w-full py-3.5 rounded-xl bg-[#2563eb] text-white font-bold hover:brightness-110 transition-all text-sm"
            >
              Entendido — continuar
            </button>
            <button
              type="button"
              onClick={resetKiosk}
              className="text-sm text-[#94a3b8] hover:text-[#64748b] text-center transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Identify — tipo selection */}
        {kiosk.phase === 'identify' && (
          <div className="flex flex-col gap-4">
            {/* Employee identity card */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
              <div className="w-10 h-10 rounded-full bg-[#2563eb]/10 flex items-center justify-center shrink-0">
                <span className="text-[#2563eb] font-bold text-sm">{initials(kiosk.nombre)}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">{kiosk.nombre}</p>
                <p className="text-xs text-[#64748b]">Selecciona el tipo de fichaje</p>
              </div>
            </div>

            {/* Tipo buttons */}
            <div className="grid grid-cols-2 gap-2">
              {(['entrada', 'salida', 'inicio_pausa', 'fin_pausa'] as const).map(tipo => {
                const isSugerido = tipo === kiosk.sugerido;
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => void handleFichar(kiosk.nombre, tipo)}
                    className={`relative py-4 rounded-xl border-2 font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                      isSugerido
                        ? TIPO_BTN_ACTIVE[tipo]
                        : 'bg-white border-[#e2e8f0] text-[#374151] hover:border-[#cbd5e1]'
                    }`}
                  >
                    {TIPO_LABEL[tipo]}
                    {isSugerido && (
                      <span className="absolute top-1.5 right-2 text-[9px] font-bold uppercase tracking-wider opacity-60">
                        sugerido
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={resetKiosk}
              className="text-sm text-[#94a3b8] hover:text-[#64748b] text-center transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Fichando */}
        {kiosk.phase === 'fichando' && (
          <div className="flex items-center justify-center py-8 text-sm text-[#6b7280]">
            Registrando fichaje...
          </div>
        )}

        {/* Done */}
        {kiosk.phase === 'done' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 px-5 py-4 bg-[#f0fdf4] border border-[#86efac] rounded-xl">
              <div className="w-10 h-10 rounded-full bg-[#16a34a] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-base leading-none">✓</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#15803d]">
                  {TIPO_LABEL[kiosk.tipo]} registrada
                </p>
                <p className="text-sm font-medium text-[#0f172a]">{kiosk.nombre}</p>
                <p className="text-xs text-[#64748b] mt-0.5">{formatEvent(kiosk.timestamp)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetKiosk}
              className="w-full py-3 rounded-xl border border-[#e2e8f0] text-[#64748b] font-medium hover:bg-[#f8fafc] transition-colors text-sm"
            >
              Fichar otro empleado
            </button>
          </div>
        )}

        {/* Error */}
        {kiosk.phase === 'error' && (
          <div className="flex flex-col gap-3">
            <div className="px-4 py-3 bg-[#fef2f2] border border-[#fca5a5] rounded-xl">
              <p className="text-sm font-medium text-[#dc2626]">{kiosk.message}</p>
            </div>
            <button
              type="button"
              onClick={resetKiosk}
              className="w-full py-3 rounded-xl border border-[#e2e8f0] text-[#64748b] font-medium hover:bg-[#f8fafc] transition-colors text-sm"
            >
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>

      {/* ── Personal history — only if employee session ── */}
      {empleadoId !== null && (
        <div className="flex flex-col gap-4">
          <div>
            <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
              Mis fichajes · últimos 30 días
            </span>
            {empleadoNombre !== null && (
              <p className="text-lg font-bold text-[#0f172a] mt-0.5">{empleadoNombre}</p>
            )}
          </div>

          {/* Pending review notifications */}
          {pendingNotifs.length > 0 && (
            <div className="flex flex-col gap-2">
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

          {/* Fichajes list */}
          {historyLoading ? (
            <p className="text-sm text-[#6b7280]">Cargando historial...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {fichajes.map(f => (
                <div
                  key={f.recordId}
                  className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${
                    f.superseded
                      ? 'border-[#fecaca] bg-[#fef2f2] opacity-50'
                      : 'border-[#e2e8f0] bg-white'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${TIPO_DOT[f.tipo] ?? 'bg-[#94a3b8]'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a]">
                      {HISTORY_TIPO_LABEL[f.tipo] ?? f.tipo}
                      {f.superseded && (
                        <span className="ml-2 text-xs font-normal text-[#94a3b8]">(anulado)</span>
                      )}
                    </p>
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      {formatEvent(f.timestampEvento)}
                    </p>
                  </div>
                </div>
              ))}
              {fichajes.length === 0 && (
                <p className="text-sm text-[#6b7280] text-center py-8">
                  No hay fichajes en los últimos 30 días.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
