'use client';

import { useState } from 'react';
import { getCsrfToken } from '@/lib/csrf-client';
import { useTpvCatalog } from '@/lib/tpv-catalog-ctx';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';

interface Props {
  readonly defaultOperador?: string;
}

export function TurnoAbrirForm({ defaultOperador = '' }: Props) {
  const { setTurno } = useTpvCatalog();
  const [operador, setOperador] = useState(defaultOperador);
  const [efectivo, setEfectivo] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = defaultOperador.length > 0;
  const canSubmit = operador.trim().length >= 2 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const csrfToken = getCsrfToken();
    const res = await fetch('/api/tpv/turno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({
        operadorNombre:        operador.trim(),
        efectivoAperturaCents: Math.round(parseFloat(efectivo || '0') * 100),
      }),
    });

    const json = await res.json() as { data?: TpvTurno };
    setLoading(false);

    if (!res.ok) {
      setError('Error al abrir el turno. Inténtalo de nuevo.');
      return;
    }

    if (json.data) setTurno(json.data);
    window.location.href = '/tpv/mostrador';
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7 w-full max-w-sm">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
          Nombre del operador
        </label>
        <input
          type="text"
          value={operador}
          onChange={e => !isReadOnly && setOperador(e.target.value)}
          readOnly={isReadOnly}
          placeholder="Escribe tu nombre..."
          autoFocus={!isReadOnly}
          maxLength={100}
          className={`bg-[#22263a] border border-[#2e3347] rounded-xl px-4 py-3.5 text-lg font-medium outline-none transition-colors placeholder:text-[#6b7280] placeholder:text-base placeholder:font-normal ${
            isReadOnly
              ? 'cursor-default opacity-70'
              : 'focus:border-[#4f72ff]'
          }`}
        />
        {isReadOnly && (
          <span className="text-xs text-[#6b7280]">Nombre registrado en tu perfil de empleado</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
          Efectivo en caja al abrir
        </label>
        <div className="flex items-center gap-2 bg-[#22263a] border border-[#2e3347] rounded-xl px-4 focus-within:border-[#4f72ff] transition-colors">
          <span className="text-[#6b7280] font-semibold">€</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={efectivo}
            onChange={e => setEfectivo(e.target.value)}
            className="flex-1 bg-transparent py-3.5 text-lg font-bold outline-none"
          />
        </div>
        <span className="text-xs text-[#6b7280]">Puede ser 0,00 € si la caja está vacía</span>
      </div>

      {error !== null && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-[#4f72ff] text-white rounded-xl py-4 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {loading ? 'Abriendo turno...' : 'Comenzar turno'}
      </button>
    </form>
  );
}
