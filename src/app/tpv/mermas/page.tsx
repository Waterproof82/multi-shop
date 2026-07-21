'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ingrediente, MotivoMerma } from '@/core/domain/entities/stock-types';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';
import { getCsrfToken } from '@/lib/csrf-client';
import { useTpvRol } from '@/lib/tpv-rol-ctx';


const MOTIVOS: { value: MotivoMerma; label: string }[] = [
  { value: 'caducidad', label: 'Caducidad' },
  { value: 'rotura', label: 'Rotura/Derrame' },
  { value: 'error_preparacion', label: 'Error de preparación' },
  { value: 'otro', label: 'Otro' },
];

interface FormState {
  ingredienteId: string;
  cantidad: string;
  motivo: MotivoMerma;
  operadorNombre: string;
  notas: string;
}

function buildEmptyForm(operador: string): FormState {
  return {
    ingredienteId: '',
    cantidad: '',
    motivo: 'caducidad',
    operadorNombre: operador,
    notas: '',
  };
}

async function fetchTurno(): Promise<TpvTurno | null> {
  const res = await fetch('/api/tpv/turno');
  if (!res.ok) return null;
  const json = (await res.json()) as TpvTurno | null;
  return json;
}

async function fetchIngredientes(): Promise<Ingrediente[]> {
  const res = await fetch('/api/tpv/stock/ingredientes');
  if (!res.ok) return [];
  const json = (await res.json()) as Ingrediente[];
  return Array.isArray(json) ? json : [];
}

async function submitMerma(
  payload: {
    ingredienteId: string;
    cantidad: number;
    motivo: MotivoMerma;
    turnoId: string | null;
    operadorNombre: string;
    notas?: string;
  },
  csrfToken: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch('/api/tpv/stock/mermas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) return { ok: true };

  let message = 'Error al registrar la merma';
  try {
    const err = (await res.json()) as { error?: string };
    if (typeof err.error === 'string') message = err.error;
  } catch {
    // use default message
  }
  return { ok: false, message };
}

function IngredienteSelect({
  ingredientes,
  value,
  onChange,
}: Readonly<{
  ingredientes: Ingrediente[];
  value: string;
  onChange: (id: string) => void;
}>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
        Ingrediente *
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] transition-colors"
        required
      >
        <option value="">— Seleccionar ingrediente —</option>
        {ingredientes.map((ing) => (
          <option key={ing.id} value={ing.id}>
            {ing.nombre} ({ing.cantidadActual.toFixed(2)} {ing.unidad})
          </option>
        ))}
      </select>
    </div>
  );
}

function MotivoSelector({
  value,
  onChange,
}: Readonly<{ value: MotivoMerma; onChange: (m: MotivoMerma) => void }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
        Motivo *
      </label>
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS.map(({ value: v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all text-left ${
              value === v
                ? 'border-[#2563eb] bg-[#eff6ff] text-[#0f172a]'
                : 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b] hover:border-[#2563eb] hover:text-[#0f172a]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MermasPage() {
  const rol = useTpvRol();
  const router = useRouter();
  const [turno, setTurno] = useState<TpvTurno | null | undefined>(undefined);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [form, setForm] = useState<FormState>(buildEmptyForm(''));
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (rol === 'cajero') { router.replace('/tpv/mostrador'); return; }
    void fetchTurno().then((t) => {
      setTurno(t);
      if (t) {
        setForm((prev) => ({ ...prev, operadorNombre: t.operadorNombre }));
      }
    });
    void fetchIngredientes().then(setIngredientes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  function updateField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!turno) return;

    const cantidad = parseFloat(form.cantidad.replace(',', '.'));
    if (isNaN(cantidad) || cantidad <= 0) {
      setErrorMsg('La cantidad debe ser mayor que 0');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccess(false);

    const csrfToken = getCsrfToken();
    const result = await submitMerma(
      {
        ingredienteId: form.ingredienteId,
        cantidad,
        motivo: form.motivo,
        turnoId: turno.id,
        operadorNombre: form.operadorNombre,
        notas: form.notas || undefined,
      },
      csrfToken,
    );

    setLoading(false);

    if (result.ok) {
      setSuccess(true);
      setForm(buildEmptyForm(turno.operadorNombre));
    } else {
      setErrorMsg(result.message ?? 'Error al registrar la merma');
    }
  }

  if (turno === undefined) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <span className="text-[#64748b] text-sm">Cargando...</span>
      </div>
    );
  }

  if (turno === null) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 flex flex-col gap-3 items-center shadow-sm">
          <span className="text-2xl">⚠️</span>
          <p className="text-[#0f172a] font-semibold">No hay turno activo</p>
          <p className="text-sm text-[#64748b]">Abre un turno de caja antes de registrar mermas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-full h-full p-6 overflow-auto">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 flex flex-col gap-6 w-full max-w-[520px] shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">TPV — Turno activo</span>
          <h1 className="text-xl font-bold text-[#0f172a]">Registrar merma</h1>
          <p className="text-xs text-[#64748b]">Operador: {turno.operadorNombre}</p>
        </div>

        {success && (
          <div className="bg-[#f0fdf4] border border-[#86efac] rounded-xl px-4 py-3 text-sm text-[#16a34a] font-medium">
            Merma registrada correctamente.
          </div>
        )}

        {errorMsg && (
          <div className="bg-[#fef2f2] border border-[#fca5a5] rounded-xl px-4 py-3 text-sm text-[#ef4444] font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-5">
          <IngredienteSelect
            ingredientes={ingredientes}
            value={form.ingredienteId}
            onChange={(id) => updateField('ingredienteId', id)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
              Cantidad *
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={form.cantidad}
              onChange={(e) => updateField('cantidad', e.target.value)}
              placeholder="0.00"
              required
              className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] transition-colors"
            />
          </div>

          <MotivoSelector
            value={form.motivo}
            onChange={(m) => updateField('motivo', m)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
              Operador *
            </label>
            <input
              type="text"
              maxLength={100}
              value={form.operadorNombre}
              onChange={(e) => updateField('operadorNombre', e.target.value)}
              required
              className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
              Notas <span className="normal-case font-normal text-[#64748b]">(opcional)</span>
            </label>
            <textarea
              maxLength={500}
              rows={3}
              value={form.notas}
              onChange={(e) => updateField('notas', e.target.value)}
              placeholder="Descripción adicional..."
              className="bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !form.ingredienteId || !form.cantidad || !form.operadorNombre}
            className="w-full py-3.5 rounded-xl bg-[#2563eb] text-white font-bold text-sm hover:bg-[#1d4ed8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registrando...' : 'Registrar merma'}
          </button>
        </form>
      </div>
    </div>
  );
}
