'use client';

import { useState } from 'react';
import { getCsrfToken } from '@/lib/csrf-client';

function firstDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function lastDay(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

export function ExportFichajes() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState<'pdf' | 'excel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(tipo: 'pdf' | 'excel') {
    setLoading(tipo);
    setError(null);

    const params = new URLSearchParams({
      tipo,
      from: firstDay(year, month),
      to:   lastDay(year, month),
    });

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/laborcontrol/export?${params.toString()}`, {
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? `Error ${res.status}`);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `fichajes-${year}-${String(month).padStart(2, '0')}.${tipo === 'pdf' ? 'pdf' : 'xlsx'}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setLoading(null);
    }
  }

  const months = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ];

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
      <div>
        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
          Exportar registros de jornada
        </p>
        <p className="text-xs text-[#94a3b8] mt-0.5">
          Descarga todos los fichajes del período seleccionado. Incluye horas extra y pausas.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748b]">Mes</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm text-[#0f172a] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#64748b]">Año</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm text-[#0f172a] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleExport('pdf')}
          disabled={loading !== null}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#dc2626] text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading === 'pdf' ? 'Generando...' : '↓ PDF'}
        </button>

        <button
          type="button"
          onClick={() => void handleExport('excel')}
          disabled={loading !== null}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#16a34a] text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading === 'excel' ? 'Generando...' : '↓ Excel'}
        </button>
      </div>

      {error !== null && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
