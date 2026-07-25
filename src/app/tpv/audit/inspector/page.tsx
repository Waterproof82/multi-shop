'use client';

import { useState } from 'react';

export default function InspectorPage() {
  const [token, setToken] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleDownload() {
    if (!token.trim()) {
      setErrorMsg('Pegue el token de acceso.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);

      const url = `/api/tpv/audit/export${params.size > 0 ? `?${params.toString()}` : ''}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg((body as { error?: string }).error ?? `Error ${res.status}`);
        setStatus('error');
        return;
      }

      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? 'tpv-cobros.json';

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
      setStatus('idle');
    } catch {
      setErrorMsg('Error de conexión. Compruebe su acceso a internet.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-6">
      <div className="w-full max-w-lg flex flex-col gap-6">

        <div>
          <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-widest mb-1">
            AEAT — Auditoría Fiscal
          </p>
          <h1 className="text-2xl font-bold text-[#0f172a]">Descarga de registros</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Introduzca el token de acceso proporcionado por el responsable del establecimiento.
          </p>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#374151]" htmlFor="token-input">
              Token de acceso
            </label>
            <textarea
              id="token-input"
              className="w-full h-28 px-3 py-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] font-mono text-xs text-[#0f172a] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent placeholder:text-[#94a3b8]"
              placeholder="Pegue aquí el token JWT proporcionado por el establecimiento…"
              value={token}
              onChange={e => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-semibold text-[#374151]" htmlFor="desde-input">
                Desde (opcional)
              </label>
              <input
                id="desde-input"
                type="date"
                className="px-3 py-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                value={desde}
                onChange={e => setDesde(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-semibold text-[#374151]" htmlFor="hasta-input">
                Hasta (opcional)
              </label>
              <input
                id="hasta-input"
                type="date"
                className="px-3 py-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
              />
            </div>
          </div>

          {status === 'error' && (
            <p className="text-sm text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={status === 'loading'}
            className="w-full py-2.5 rounded-lg bg-[#2563eb] text-white text-sm font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'loading' ? 'Descargando…' : 'Descargar registros de cobros'}
          </button>
        </div>

        <p className="text-[11px] text-[#94a3b8] text-center">
          El token tiene validez de 24 horas desde su emisión.
          Los registros se descargan en formato JSON conforme a RD 1619/2012 y RD 1007/2023.
        </p>
      </div>
    </div>
  );
}
