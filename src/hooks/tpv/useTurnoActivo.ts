'use client';

import { useEffect, useState } from 'react';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';

interface UseTurnoActivoResult {
  turno: TpvTurno | null;
  loading: boolean;
  refetch: () => void;
}

export function useTurnoActivo(): UseTurnoActivoResult {
  const [turno, setTurno] = useState<TpvTurno | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/tpv/turno')
      .then(r => r.json())
      .then((json: { success?: boolean; data?: TpvTurno }) => {
        if (!cancelled) {
          setTurno(json.success ? (json.data ?? null) : null);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  return { turno, loading, refetch: () => setTick(t => t + 1) };
}
