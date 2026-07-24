'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EstadoSupervisor } from '@/core/laborcontrol/domain/types';

// Read-only view for RLT (Representante Legal de los Trabajadores)
// Mirrors supervisor panel but no mutations

export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<EstadoSupervisor['estado'], string> = {
  dentro:    'En jornada',
  pausa:     'En pausa',
  fuera:     'Fuera',
  sin_datos: 'Sin datos',
};

export default function RltPage() {
  const [estados, setEstados] = useState<EstadoSupervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  if (error !== null) return <div className="p-8 text-sm text-red-500">{error}</div>;

  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Vista RLT (solo lectura)</span>
        <h1 className="text-2xl font-bold">Registro de jornada</h1>
      </div>

      <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-xs text-[#6b7280] uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Empleado</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Último evento</th>
            </tr>
          </thead>
          <tbody>
            {estados.map((e, i) => (
              <tr key={e.empleadoId} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
                <td className="px-4 py-3">{e.empleadoNombre}</td>
                <td className="px-4 py-3">{ESTADO_LABEL[e.estado]}</td>
                <td className="px-4 py-3">
                  {e.ultimoEvento
                    ? new Date(e.ultimoEvento.timestampServidor).toLocaleString('es-ES')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {estados.length === 0 && (
          <p className="px-4 py-6 text-sm text-[#6b7280]">Sin datos</p>
        )}
      </div>
    </div>
  );
}
