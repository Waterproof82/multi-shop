'use client';

import { useState } from 'react';
import { getCsrfToken } from '@/lib/csrf-client';
import { useLanguage, type Language } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface Ingrediente {
  id: string;
  nombre: string;
  unidad: string;
  cantidadActual: number;
}

interface Props {
  readonly ingredientes: Ingrediente[];
  readonly operadorNombre: string;
}

interface Delta {
  nombre: string;
  teorico: number;
  real: number;
  delta: number;
  unidad: string;
}

type Step = 'conteo' | 'confirmacion' | 'completado';

function desviacionesTexto(n: number, language: Language): string {
  if (n === 1) return t("invDeviationsOne", language);
  return t("invDeviationsMany", language).replace("{count}", String(n));
}

function fmt(n: number, unidad: string) {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unidad}`;
}

export function InventarioFisicoClient({ ingredientes, operadorNombre }: Readonly<Props>) {
  const { language } = useLanguage();
  const [step, setStep] = useState<Step>('conteo');
  const [conteos, setConteos] = useState<Record<string, string>>({});
  const [deltas, setDeltas] = useState<Delta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(id: string, value: string) {
    setConteos(prev => ({ ...prev, [id]: value }));
  }

  function calcDeltas(): Delta[] {
    return ingredientes
      .filter(ing => conteos[ing.id] !== undefined && conteos[ing.id].trim() !== '')
      .map(ing => {
        const real = parseFloat(conteos[ing.id] ?? '0');
        return {
          nombre: ing.nombre,
          teorico: ing.cantidadActual,
          real,
          delta: real - ing.cantidadActual,
          unidad: ing.unidad,
        };
      })
      .filter(d => Math.abs(d.delta) > 0.0001);
  }

  function handleRevisar() {
    setDeltas(calcDeltas());
    setStep('confirmacion');
  }

  async function handleConfirmar() {
    setLoading(true);
    setError(null);

    const items = ingredientes
      .filter(ing => conteos[ing.id] !== undefined && conteos[ing.id].trim() !== '')
      .map(ing => ({
        ingredienteId: ing.id,
        cantidadReal: parseFloat(conteos[ing.id] ?? '0'),
      }));

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/admin/stock/inventario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ items, operadorNombre }),
      });

      if (res.ok) {
        setStep('completado');
      } else {
        const json = await res.json() as { error?: string };
        setError(json.error ?? t("errRegisterInventario", language));
      }
    } catch {
      setError(t("connectionError", language));
    } finally {
      setLoading(false);
    }
  }

  if (step === 'completado') {
    return (
      <div className="flex flex-col items-center gap-6 py-16">
        <div className="w-16 h-16 rounded-full bg-[#22c55e22] border-2 border-[#22c55e] flex items-center justify-center text-2xl">✓</div>
        <h2 className="text-xl font-bold">{t("invRegistered", language)}</h2>
        <p className="text-sm text-[#6b7280] text-center max-w-xs">
          {deltas.length === 1
            ? t("invAdjustedOne", language)
            : t("invAdjustedMany", language).replace("{count}", String(deltas.length))}
        </p>
        <button
          type="button"
          onClick={() => { setStep('conteo'); setConteos({}); setDeltas([]); }}
          className="px-6 py-2.5 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110"
        >
          {t("invNew", language)}
        </button>
      </div>
    );
  }

  if (step === 'confirmacion') {
    return (
      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <div>
          <h2 className="text-lg font-bold">{t("invReviewDeviations", language)}</h2>
          <p className="text-sm text-[#6b7280] mt-1">
            {deltas.length === 0
              ? t("invNoDeviations", language)
              : desviacionesTexto(deltas.length, language)}
          </p>
        </div>

        {deltas.length > 0 && (
          <div className="flex flex-col gap-2">
            {deltas.map(d => (
              <div key={d.nombre} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center gap-4">
                <span className="flex-1 text-sm font-medium">{d.nombre}</span>
                <span className="text-xs text-[#6b7280]">{t("invTheoretical", language)} {fmt(d.teorico, d.unidad)}</span>
                <span className="text-xs text-[#6b7280]">{t("invReal", language)} {fmt(d.real, d.unidad)}</span>
                <span className={`text-sm font-bold w-24 text-right ${d.delta > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {d.delta > 0 ? '+' : ''}{fmt(d.delta, d.unidad)}
                </span>
              </div>
            ))}
          </div>
        )}

        {error !== null && (
          <p className="text-sm text-[#ef4444] bg-[#ef444415] border border-[#ef444430] rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('conteo')}
            className="flex-1 py-3 rounded-xl border border-[#2e3347] text-[#6b7280] text-sm font-semibold hover:text-white transition-colors"
          >
            {t("invCorrect", language)}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmar()}
            disabled={loading}
            className="flex-[2] py-3 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110 disabled:opacity-50"
          >
            {loading ? t("invRegistering", language) : t("invConfirmRegister", language)}
          </button>
        </div>
      </div>
    );
  }

  const filled = Object.values(conteos).filter(v => v.trim() !== '').length;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg font-bold">{t("invPhysicalCount", language)}</h2>
        <p className="text-sm text-[#6b7280] mt-1">
          {t("invPhysicalCountHelp", language)}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ingredientes.map(ing => (
          <div key={ing.id} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center gap-4">
            <span className="flex-1 text-sm font-medium">{ing.nombre}</span>
            <span className="text-xs text-[#6b7280] shrink-0">{ing.unidad}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={conteos[ing.id] ?? ''}
              onChange={e => handleChange(ing.id, e.target.value)}
              placeholder="—"
              className="w-28 bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-1.5 text-sm text-right outline-none focus:border-[#4f72ff] transition-colors"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[#6b7280]">{filled} de {ingredientes.length} contados</span>
        <button
          type="button"
          onClick={handleRevisar}
          disabled={filled === 0}
          className="px-6 py-3 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110 disabled:opacity-40"
        >
          {t("invReviewDeviationsArrow", language)}
        </button>
      </div>
    </div>
  );
}
