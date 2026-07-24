'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { EstadoSupervisor } from '@/core/laborcontrol/domain/types';
import { ExportFichajes } from '@/components/laborcontrol/ExportFichajes';

// Read-only view for RLT (Representante Legal de los Trabajadores)
// Art. 64 ET — mirrors supervisor data, no mutations allowed

export const dynamic = 'force-dynamic';

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

export default function RltPage() {
  const [estados, setEstados] = useState<EstadoSupervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/laborcontrol/supervisor');
    if (res.ok) {
      setEstados(await res.json() as EstadoSupervisor[]);
    } else {
      setError('No autorizado');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <div className="p-8 text-sm text-[#6b7280]">Cargando...</div>;
  if (error !== null) return <div className="p-8 text-sm text-[#ef4444]">{error}</div>;

  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-[#d97706] uppercase tracking-wider">
            Vista RLT · Art. 64 ET · Solo lectura
          </span>
          <h1 className="text-2xl font-bold text-[#0f172a]">Registro de jornada</h1>
        </div>
        <Link
          href="/tpv/mostrador"
          className="shrink-0 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#64748b] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
        >
          ← Volver
        </Link>
      </div>

      {/* Table */}
      <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-[#64748b] uppercase tracking-wider">
                Empleado
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-[#64748b] uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-[#64748b] uppercase tracking-wider">
                Último evento
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {estados.map(e => (
              <tr key={e.empleadoId} className="bg-white hover:bg-[#f8fafc] transition-colors">
                <td className="px-4 py-3 font-medium text-[#0f172a]">
                  {e.empleadoNombre}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex text-xs px-2.5 py-1 rounded-full border font-medium ${ESTADO_CHIP[e.estado]}`}>
                    {ESTADO_LABEL[e.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#6b7280]">
                  {e.ultimoEvento
                    ? new Date(e.ultimoEvento.timestampServidor).toLocaleString('es-ES', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {estados.length === 0 && (
          <p className="px-4 py-8 text-sm text-[#6b7280] text-center">Sin datos</p>
        )}
      </div>

      <ExportFichajes />
    </div>
  );
}
