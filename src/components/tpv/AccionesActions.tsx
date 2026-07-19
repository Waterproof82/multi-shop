'use client';

import { useRouter } from 'next/navigation';
import { useTpvRol } from '@/lib/tpv-rol-ctx';

interface Props {
  readonly sesionId: string | null;
  readonly turnoId: string;
  readonly onRefresh: () => Promise<void>;
  readonly refreshing: boolean;
}

type ActionVariant = 'default' | 'active' | 'danger';

interface ActionIconProps {
  readonly emoji: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: ActionVariant;
}

function resolveVariantClass(variant: ActionVariant): string {
  if (variant === 'active') return 'bg-[#4f72ff18] border-[#4f72ff55]';
  if (variant === 'danger') return 'bg-[#ef444415] border-[#ef444433]';
  return 'border-transparent hover:bg-[#22263a] hover:border-[#2e3347]';
}

function resolveLabelClass(variant: ActionVariant): string {
  if (variant === 'active') return 'text-[#4f72ff]';
  if (variant === 'danger') return 'text-[#ef4444]';
  return 'text-[#6b7280]';
}

function ActionIcon({ emoji, label, onClick, disabled = false, variant = 'default' }: Readonly<ActionIconProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${resolveVariantClass(variant)}`}
    >
      <span className="text-xl leading-none" aria-hidden="true">{emoji}</span>
      <span className={`text-[6.5px] font-semibold uppercase tracking-wide ${resolveLabelClass(variant)}`}>
        {label}
      </span>
    </button>
  );
}

export function AccionesPanel({ sesionId, turnoId, onRefresh, refreshing }: Readonly<Props>) {
  const router = useRouter();
  const rol = useTpvRol();
  const isCajero = rol === 'cajero';
  const hasMesa = sesionId !== null;

  return (
    <aside className="w-16 shrink-0 bg-[#1a1d27] border-l border-[#2e3347] flex flex-col items-center py-3 gap-1.5">
      <ActionIcon
        emoji="🪑"
        label="Mesa"
        onClick={() => router.push('/tpv/mesas?seleccionar=1')}
        variant={hasMesa ? 'active' : 'default'}
      />
      <ActionIcon
        emoji="🔄"
        label="Actualizar"
        onClick={() => { void onRefresh(); }}
        disabled={!hasMesa || refreshing}
      />
      <ActionIcon
        emoji="🧾"
        label="Ticket"
        onClick={() => { if (sesionId) router.push(`/tpv/cobro/${sesionId}?turnoId=${turnoId}`); }}
        disabled={!hasMesa}
      />

      <div className="w-7 h-px bg-[#2e3347] my-1" role="separator" />

      {!isCajero && (
        <ActionIcon emoji="📋" label="Historial" onClick={() => router.push('/tpv/historial')} />
      )}
      {!isCajero && (
        <ActionIcon emoji="📊" label="Analítica" onClick={() => router.push('/tpv/analytics')} />
      )}
      {!isCajero && (
        <ActionIcon emoji="⚖️" label="Legal" onClick={() => router.push('/tpv/legal')} />
      )}

      <div className="flex-1" />

      <ActionIcon
        emoji="⏻"
        label="Cierre"
        onClick={() => router.push('/tpv/turno/cerrar')}
        variant="danger"
      />
    </aside>
  );
}
