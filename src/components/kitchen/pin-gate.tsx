'use client';

import { useState, useEffect } from 'react';
import { UtensilsCrossed, KeyRound } from 'lucide-react';

const BG       = 'oklch(13% 0.02 252)';
const TEXT_DIM = 'oklch(55% 0.04 252)';

export function KitchenPinGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const [authed, setAuthed]           = useState(false);
  const [checking, setChecking]       = useState(true);
  const [pin, setPin]                 = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/waiter/me')
      .then(r => { if (r.ok) setAuthed(true); })
      .catch(() => null)
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/waiter/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        globalThis.dispatchEvent(new CustomEvent('waiter-auth-changed'));
        setAuthed(true);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'PIN incorrecto');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'oklch(42% 0.06 252)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (authed) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-10" style={{ background: BG }}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl"
          style={{ background: 'oklch(18% 0.06 252)', border: '1px solid oklch(32% 0.08 252 / 0.6)' }}>
          <UtensilsCrossed className="w-7 h-7" style={{ color: 'oklch(60% 0.14 252)' }} />
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4" style={{ color: TEXT_DIM }} />
          <p className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: TEXT_DIM }}>
            Acceso Cocina
          </p>
        </div>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="password"
          inputMode="numeric"
          maxLength={12}
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="••••"
          className="w-full rounded-xl px-4 py-4 text-center text-2xl font-bold tracking-[0.4em] focus:outline-none focus:ring-2 transition-all"
          style={{
            background: 'oklch(17% 0.025 252 / 0.9)',
            border: '1px solid oklch(32% 0.05 252 / 0.7)',
            color: 'oklch(88% 0.03 252)',
            caretColor: 'oklch(60% 0.08 252)',
          }}
          required
        />
        {error && (
          <p className="text-sm text-center" style={{ color: 'oklch(65% 0.2 25)' }} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || pin.length < 4}
          className="w-full rounded-xl py-4 font-bold text-base transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'oklch(26% 0.08 252 / 0.9)',
            border: '1px solid oklch(42% 0.10 252 / 0.5)',
            color: 'oklch(82% 0.04 252)',
          }}
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
