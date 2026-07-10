'use client';

import { useState } from 'react';

export function TpvLoginForm() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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

    const data = await res.json() as { nextUrl?: string; rol?: string };
    // Notify TpvRolProvider of the new role before navigating so the cached layout
    // context updates immediately (Next.js Router Cache reuses the layout component).
    window.dispatchEvent(new CustomEvent('tpv-auth-changed', {
      detail: { rol: data.rol ?? 'cajero', isEmployeeSession: true },
    }));
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = data.nextUrl ?? '/tpv/mostrador';
    document.body.appendChild(form);
    form.submit();
  }

  return (
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
        className="bg-[#22263a] border border-[#2e3347] rounded-xl px-4 py-3.5 text-2xl font-bold text-center tracking-widest outline-none focus:border-[#4f72ff] transition-colors placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#6b7280]"
      />
      {error !== null && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-center">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pin.length < 4 || loading}
        className="bg-[#4f72ff] text-white rounded-xl py-4 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {loading ? 'Verificando...' : 'Entrar'}
      </button>
    </form>
  );
}
