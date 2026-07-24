'use client';

import { useState, useEffect, useCallback } from 'react';
import { useId } from 'react';
import type { FichajeEvento } from '@/core/laborcontrol/domain/types';

interface Props {
  readonly open: boolean;
  readonly empleadoId: string;
  readonly sugerido?: Exclude<FichajeEvento['tipo'], 'correccion'>;
  readonly onDone: () => void;
  readonly onSkip: () => void;
}

const TIPO_LABEL: Record<Exclude<FichajeEvento['tipo'], 'correccion'>, string> = {
  entrada:      'Fichar entrada',
  salida:       'Fichar salida',
  inicio_pausa: 'Iniciar pausa',
  fin_pausa:    'Fin de pausa',
};

export function FichajeDialog({ open, empleadoId, sugerido = 'entrada', onDone, onSkip }: Props) {
  const dialogId = useId();
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [isOnline, setIsOnline]   = useState(true);
  const [queued, setQueued]       = useState(false);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const handleFichar = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isOnline) {
      // Queue offline — let offline-queue module handle sync
      try {
        const { enqueue } = await import('@/lib/laborcontrol/offline-queue');
        await enqueue({ empleadoId, tipo: sugerido, timestampEvento: new Date().toISOString() });
        setQueued(true);
        setTimeout(onDone, 1200);
      } catch {
        setError('No hay conexión. Intenta de nuevo cuando estés online.');
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/laborcontrol/fichaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleadoId,
          tipo:            sugerido,
          timestampEvento: new Date().toISOString(),
          origenOffline:   false,
        }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Error al fichar');
        setLoading(false);
        return;
      }

      onDone();
    } catch {
      setError('Error de red. Intenta de nuevo.');
      setLoading(false);
    }
  }, [empleadoId, isOnline, onDone, sugerido]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">
            Control de jornada
          </span>
          <h2 id={`${dialogId}-title`} className="text-xl font-bold text-[#0f172a]">
            {TIPO_LABEL[sugerido]}
          </h2>
          {!isOnline && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Sin conexión — el fichaje se guardará offline y se sincronizará al recuperar red.
            </p>
          )}
        </div>

        {queued && (
          <p className="text-sm text-green-600 text-center">Fichaje guardado offline ✓</p>
        )}

        {error !== null && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-3 rounded-xl border border-[#e2e8f0] text-[#64748b] font-medium hover:bg-[#f8fafc] transition-colors"
          >
            Omitir
          </button>
          <button
            type="button"
            onClick={handleFichar}
            disabled={loading || queued}
            className="flex-1 py-3 rounded-xl bg-[#2563eb] text-white font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Fichando...' : TIPO_LABEL[sugerido]}
          </button>
        </div>
      </div>
    </div>
  );
}
