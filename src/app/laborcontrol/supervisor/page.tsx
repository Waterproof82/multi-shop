'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import type { EstadoSupervisor } from '@/core/laborcontrol/domain/types';

export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<EstadoSupervisor['estado'], string> = {
  dentro:    'En jornada',
  pausa:     'En pausa',
  fuera:     'Fuera',
  sin_datos: 'Sin datos',
};

const ESTADO_COLOR: Record<EstadoSupervisor['estado'], string> = {
  dentro:    'bg-green-100 text-green-700 border-green-200',
  pausa:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  fuera:     'bg-gray-100 text-gray-500 border-gray-200',
  sin_datos: 'bg-slate-100 text-slate-400 border-slate-200',
};

function fmtSegundos(s: number | null): string {
  if (s === null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SupervisorPage() {
  const channelId = useId();
  const [estados, setEstados] = useState<EstadoSupervisor[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/laborcontrol/supervisor');
    if (res.ok) {
      const data = await res.json() as EstadoSupervisor[];
      setEstados(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabaseAnonClient();
    const ch = supabase
      .channel(`lc-supervisor-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lc_fichajes' }, () => {
        void refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [channelId, refresh]);

  if (loading) {
    return <div className="p-8 text-sm text-[#6b7280]">Cargando...</div>;
  }

  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">Control de jornada</span>
        <h1 className="text-2xl font-bold">Panel supervisor</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {estados.map(e => (
          <div
            key={e.empleadoId}
            className="border border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-2 bg-white"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{e.empleadoNombre}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ESTADO_COLOR[e.estado]}`}>
                {ESTADO_LABEL[e.estado]}
              </span>
            </div>
            <div className="flex justify-between text-xs text-[#6b7280]">
              <span>Último evento</span>
              <span>{e.ultimoEvento ? new Date(e.ultimoEvento.timestampServidor).toLocaleTimeString('es-ES') : '—'}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6b7280]">
              <span>Tiempo desde último evento</span>
              <span>{fmtSegundos(e.tiempoDesdeUltimoEvento)}</span>
            </div>
          </div>
        ))}
      </div>

      {estados.length === 0 && (
        <p className="text-sm text-[#6b7280]">No hay empleados con perfil laboral activo.</p>
      )}
    </div>
  );
}
