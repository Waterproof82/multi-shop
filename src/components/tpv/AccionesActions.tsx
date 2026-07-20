'use client';

import { useRouter } from 'next/navigation';
import { useTpvRol } from '@/lib/tpv-rol-ctx';

type ActionVariant = 'default' | 'active' | 'danger';

interface ActionIconProps {
  emoji: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: ActionVariant;
}

function resolveVariantClass(variant: ActionVariant): string {
  if (variant === 'active') return 'bg-[#eff6ff] border-[#93c5fd]';
  if (variant === 'danger') return 'bg-[#fef2f2] border-[#fca5a5]';
  return 'border-[#e2e8f0] hover:bg-[#f1f5f9] hover:border-[#cbd5e1]';
}

function resolveLabelClass(variant: ActionVariant): string {
  if (variant === 'active') return 'text-[#2563eb]';
  if (variant === 'danger') return 'text-[#ef4444]';
  return 'text-[#64748b]';
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
      <span className={`text-[8px] font-semibold uppercase tracking-wide ${resolveLabelClass(variant)}`}>
        {label}
      </span>
    </button>
  );
}

export function AccionesPanel() {
  const router = useRouter();
  const rol = useTpvRol();
  const isCajero = rol === 'cajero';

  return (
    <aside className="w-16 shrink-0 bg-white border-l border-[#e2e8f0] flex flex-col items-center py-3 gap-1.5">
      {!isCajero && (
        <>
          <ActionIcon emoji="📊" label="Analítica" onClick={() => router.push('/tpv/analytics')} />
          <ActionIcon emoji="📉" label="Mermas" onClick={() => router.push('/tpv/mermas')} />
        </>
      )}

      <div className="flex-1" />

      {!isCajero && (
        <ActionIcon emoji="⚖️" label="Legal" onClick={() => router.push('/tpv/legal')} />
      )}
    </aside>
  );
}
