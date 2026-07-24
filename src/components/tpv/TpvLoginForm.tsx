'use client';

import { useState, useCallback } from 'react';
import { FichajeDialog } from '@/components/laborcontrol/FichajeDialog';

export function TpvLoginForm() {
  const [pin, setPin]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<{ nextUrl: string; empleadoId: string } | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pin.length < 4 || loading) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/tpv/empleados/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (!res.ok) {
      setLoading(false);
      setError('PIN incorrecto');
      setPin('');
      return;
    }

    const data = await res.json() as { nextUrl?: string; rol?: string; empleadoId?: string };
    // Notify TpvRolProvider of the new role before navigating so the cached layout
    // context updates immediately (Next.js Router Cache reuses the layout component).
    window.dispatchEvent(new CustomEvent('tpv-auth-changed', {
      detail: { rol: data.rol ?? 'cajero', isEmployeeSession: true },
    }));

    if (data.empleadoId) {
      setPendingNav({ nextUrl: data.nextUrl ?? '/tpv/mostrador', empleadoId: data.empleadoId });
    } else {
      doNavigate(data.nextUrl ?? '/tpv/mostrador');
    }
  }

  const doNavigate = useCallback((nextUrl: string) => {
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = nextUrl;
    document.body.appendChild(form);
    form.submit();
  }, []);

  const handleFichajeDone = useCallback(() => {
    if (pendingNav) doNavigate(pendingNav.nextUrl);
  }, [pendingNav, doNavigate]);

  const handleFichajeSkip = useCallback(() => {
    if (pendingNav) doNavigate(pendingNav.nextUrl);
  }, [pendingNav, doNavigate]);

  return (
    <>
    {pendingNav !== null && (
      <FichajeDialog
        open
        empleadoId={pendingNav.empleadoId}
        sugerido="entrada"
        onDone={handleFichajeDone}
        onSkip={handleFichajeSkip}
      />
    )}
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        placeholder="PIN (4-8 dígitos)"
        autoFocus
        style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
        className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3.5 text-2xl font-bold text-center tracking-widest outline-none focus:border-[#2563eb] transition-colors placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#94a3b8] text-[#0f172a]"
      />
      {error !== null && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-center">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pin.length < 4 || loading}
        className="bg-[#2563eb] text-white rounded-xl py-4 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {loading ? 'Verificando...' : 'Entrar'}
      </button>
    </form>
    </>
  );
}
