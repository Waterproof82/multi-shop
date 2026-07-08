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
    <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider mb-1">
            Verificación de Integridad
          </p>
          <p className="text-sm text-[#c8cad4]">
            Recorre toda la cadena de cobros y recomputa los hashes SHA-256 para detectar
            cualquier alteración de registros.
          </p>
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={state === 'loading'}
          className="shrink-0 px-4 py-2 rounded-lg bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === 'loading' ? 'Verificando...' : 'Verificar cadena'}
        </button>
      </div>

      {result !== null && (
        <div
          className="rounded-lg p-4 text-sm flex flex-col gap-1"
          style={{
            background: result.ok ? 'oklch(25% 0.06 145 / 0.4)' : 'oklch(25% 0.08 15 / 0.4)',
            borderColor: result.ok ? 'oklch(45% 0.15 145)' : 'oklch(45% 0.18 15)',
            border: '1px solid',
          }}
        >
          <p className="font-bold" style={{ color: result.ok ? '#22c55e' : '#ef4444' }}>
            {result.ok ? '✓ Cadena íntegra' : '✗ Integridad comprometida'}
          </p>
          <p className="text-[#a0a4b8]">
            {result.ok
              ? (result.message ?? `${result.checked.toLocaleString('es-ES')} cobros verificados correctamente.`)
              : result.error}
          </p>
          {!result.ok && result.checked > 0 && (
            <p className="text-[#6b7280] text-xs">
              Verificados {result.checked} de {result.total} registros antes del error.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <a
          href="/api/tpv/audit/export"
          download
          className="text-xs text-[#4f72ff] hover:underline"
        >
          Exportar todos los cobros (JSON) →
        </a>
        <a
          href={`/api/tpv/audit/export?desde=${new Date().toISOString().slice(0, 10)}&hasta=${new Date().toISOString().slice(0, 10)}`}
          download
          className="text-xs text-[#6b7280] hover:text-[#4f72ff] hover:underline"
        >
          Exportar hoy →
        </a>
      </div>
    </div>
  );
}
