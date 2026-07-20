'use client';

import { useState } from 'react';

type VerifyResult =
  | { ok: true; total: number; checked: number; message?: string }
  | { ok: false; total: number; checked: number; error: string };

export function LegalChainVerify() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function verify() {
    setState('loading');
    try {
      const res = await fetch('/api/tpv/audit/chain');
      const json = (await res.json()) as VerifyResult;
      setResult(json);
      setState('done');
    } catch {
      setResult({ ok: false, total: 0, checked: 0, error: 'Error de conexión al verificar la cadena' });
      setState('done');
    }
  }

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1">
            Verificación de Integridad
          </p>
          <p className="text-sm text-[#475569]">
            Recorre toda la cadena de cobros y recomputa los hashes SHA-256 para detectar
            cualquier alteración de registros.
          </p>
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={state === 'loading'}
          className="shrink-0 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-bold hover:bg-[#1d4ed8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'loading' ? 'Verificando...' : 'Verificar cadena'}
        </button>
      </div>

      {result !== null && (
        <div
          className="rounded-lg p-4 text-sm flex flex-col gap-1 border"
          style={{
            background: result.ok ? '#f0fdf4' : '#fef2f2',
            borderColor: result.ok ? '#86efac' : '#fca5a5',
          }}
        >
          <p className="font-bold" style={{ color: result.ok ? '#16a34a' : '#ef4444' }}>
            {result.ok ? '✓ Cadena íntegra' : '✗ Integridad comprometida'}
          </p>
          <p className="text-[#64748b]">
            {result.ok
              ? (result.message ?? `${result.checked.toLocaleString('es-ES')} cobros verificados correctamente.`)
              : result.error}
          </p>
          {!result.ok && result.checked > 0 && (
            <p className="text-[#94a3b8] text-xs">
              Verificados {result.checked} de {result.total} registros antes del error.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <a
          href="/api/tpv/audit/export"
          download
          className="text-xs text-[#2563eb] hover:underline"
        >
          Exportar todos los cobros (JSON) →
        </a>
        <a
          href={`/api/tpv/audit/export?desde=${new Date().toISOString().slice(0, 10)}&hasta=${new Date().toISOString().slice(0, 10)}`}
          download
          className="text-xs text-[#64748b] hover:text-[#2563eb] hover:underline"
        >
          Exportar hoy →
        </a>
      </div>
    </div>
  );
}
