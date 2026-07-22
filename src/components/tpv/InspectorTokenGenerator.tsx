'use client';

import { useState } from 'react';
import { fetchWithCsrf } from '@/lib/csrf-client';

type TokenState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; exportUrl: string; expiresIn: string }
  | { status: 'error'; message: string };

export function InspectorTokenGenerator() {
  const [state, setState] = useState<TokenState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setState({ status: 'loading' });
    try {
      const res = await fetchWithCsrf('/api/tpv/audit/inspector-token', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        setState({ status: 'error', message: (body.error as string | undefined) ?? `Error ${res.status}` });
        return;
      }
      const data = await res.json() as { export_url: string; expires_in: string };
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      setState({ status: 'done', exportUrl: base + data.export_url, expiresIn: data.expires_in });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Error inesperado' });
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
      <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
        Acceso Inspector Hacienda
      </p>
      <p className="text-xs text-[#64748b] leading-relaxed">
        Genera un enlace temporal (24 h) que permite a un inspector de la AEAT descargar
        los registros de cobros sin necesidad de credenciales de administrador.
      </p>

      {state.status === 'idle' && (
        <button
          type="button"
          onClick={handleGenerate}
          className="self-start px-4 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4ed8] transition-colors"
        >
          Generar enlace de inspector
        </button>
      )}

      {state.status === 'loading' && (
        <p className="text-xs text-[#64748b]">Generando enlace…</p>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#ef4444]">{state.message}</p>
          <button
            type="button"
            onClick={() => setState({ status: 'idle' })}
            className="self-start text-xs text-[#2563eb] underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {state.status === 'done' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-lg p-3">
            <p className="text-xs text-[#0c4a6e] break-all flex-1 font-mono">{state.exportUrl}</p>
            <button
              type="button"
              onClick={() => handleCopy(state.exportUrl)}
              className="shrink-0 px-3 py-1 rounded bg-[#2563eb] text-white text-xs font-medium hover:bg-[#1d4ed8] transition-colors"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[11px] text-[#64748b]">
            Válido durante <strong className="text-[#475569]">{state.expiresIn}</strong>.
            Compártelo solo con el inspector. No requiere credenciales de administrador.
          </p>
          <button
            type="button"
            onClick={() => { setState({ status: 'idle' }); setCopied(false); }}
            className="self-start text-xs text-[#2563eb] underline"
          >
            Generar nuevo enlace
          </button>
        </div>
      )}
    </div>
  );
}
