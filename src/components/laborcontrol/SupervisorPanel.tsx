'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import type { EstadoSupervisor } from '@/core/laborcontrol/domain/types';
import { ExportFichajes } from '@/components/laborcontrol/ExportFichajes';

const ESTADO_LABEL: Record<EstadoSupervisor['estado'], string> = {
  dentro:    'En jornada',
  pausa:     'En pausa',
  fuera:     'Fuera',
  sin_datos: 'Sin datos',
};

const ESTADO_CHIP: Record<EstadoSupervisor['estado'], string> = {
  dentro:    'bg-[#f0fdf4] text-[#15803d] border-[#86efac]',
  pausa:     'bg-[#fffbeb] text-[#92400e] border-[#fcd34d]',
  fuera:     'bg-[#f1f5f9] text-[#475569] border-[#cbd5e1]',
  sin_datos: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]',
};

const ESTADO_DOT: Record<EstadoSupervisor['estado'], string> = {
  dentro:    'bg-[#16a34a]',
  pausa:     'bg-[#f59e0b]',
  fuera:     'bg-[#94a3b8]',
  sin_datos: 'bg-[#e2e8f0]',
};

function fmtSegundos(s: number | null): string {
  if (s === null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtHora(ts: Date | string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  showBackButton?: boolean;
}

export function SupervisorPanel({ showBackButton = false }: Readonly<Props>) {
  const channelId = useId();
  const [estados, setEstados] = useState<EstadoSupervisor[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/laborcontrol/supervisor');
    if (res.ok) setEstados(await res.json() as EstadoSupervisor[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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

  const dentro  = estados.filter(e => e.estado === 'dentro').length;
  const enPausa = estados.filter(e => e.estado === 'pausa').length;
  const fuera   = estados.filter(e => e.estado === 'fuera' || e.estado === 'sin_datos').length;

  if (loading) return <div className="p-8 text-sm text-[#6b7280]">Cargando...</div>;

  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-[#d97706] uppercase tracking-wider">
            Control de jornada · Art. 34.9 ET
          </span>
          <h1 className="text-2xl font-bold text-[#0f172a]">Panel supervisor</h1>
        </div>
        {showBackButton && (
          <Link
            href="/tpv/mostrador"
            className="shrink-0 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#64748b] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
          >
            ← Volver
          </Link>
        )}
      </div>

      {/* Summary bar */}
      {estados.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#f0fdf4] border border-[#86efac] rounded-xl">
            <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <span className="text-sm font-semibold text-[#15803d]">{dentro} en jornada</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-[#fffbeb] border border-[#fcd34d] rounded-xl">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
            <span className="text-sm font-semibold text-[#92400e]">{enPausa} en pausa</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl">
            <span className="w-2 h-2 rounded-full bg-[#94a3b8]" />
            <span className="text-sm font-semibold text-[#475569]">{fuera} fuera</span>
          </div>
        </div>
      )}

      {/* Employee cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {estados.map(e => (
          <div
            key={e.empleadoId}
            className="border border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-3 bg-white"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ESTADO_DOT[e.estado]}`} />
                <span className="text-sm font-semibold text-[#0f172a] truncate">
                  {e.empleadoNombre}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {e.fichajesPendientesRevision > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] border border-[#fcd34d]">
                    {e.fichajesPendientesRevision} revisión
                  </span>
                )}
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${ESTADO_CHIP[e.estado]}`}>
                  {ESTADO_LABEL[e.estado]}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 text-xs text-[#6b7280] border-t border-[#f1f5f9] pt-2.5">
              <span>Último evento</span>
              <span className="text-right font-medium text-[#374151]">
                {fmtHora(e.ultimoEvento?.timestampServidor)}
              </span>
              <span>Tiempo transcurrido</span>
              <span className="text-right font-medium text-[#374151]">
                {fmtSegundos(e.tiempoDesdeUltimoEvento)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {estados.length === 0 && (
        <p className="text-sm text-[#6b7280]">
          No hay empleados con perfil laboral activo.
        </p>
      )}

      <ExportFichajes />
    </div>
  );
}
