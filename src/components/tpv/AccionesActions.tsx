'use client';

import { useRouter } from 'next/navigation';
import { useTpvRol } from '@/lib/tpv-rol-ctx';
import { useTpvAcciones } from '@/lib/tpv-acciones-ctx';

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
      className={`w-16 h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${resolveVariantClass(variant)}`}
    >
      <span className="text-xl leading-none" aria-hidden="true">{emoji}</span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${resolveLabelClass(variant)}`}>
        {label}
      </span>
    </button>
  );
}

const ADMIN_SHORTCUTS = [
  { emoji: '📦', label: 'Produc.',  href: '/admin/productos' },
  { emoji: '🏷️', label: 'Categ.',   href: '/admin/categorias' },
  { emoji: '🧩', label: 'Compl.',   href: '/admin/complementos' },
  { emoji: '📋', label: 'Recetas',  href: '/admin/stock/recetas' },
  { emoji: '🧂', label: 'Ingred.',  href: '/admin/stock/ingredientes' },
] as const;

function toAdmin(href: string) {
  window.location.href = href;
}

export function AccionesPanel() {
  const router = useRouter();
  const rol = useTpvRol();
  const { hasPendingItems } = useTpvAcciones();
  const isCajero = rol === 'cajero';
  const isAdmin = rol === 'admin' || rol === 'superadmin' || rol === 'encargado';

  if (hasPendingItems) return null;

  return (
    <aside className="w-20 shrink-0 bg-white border-l border-[#e2e8f0] flex flex-col items-center py-3 gap-1.5 overflow-y-auto">
      {!isCajero && (
        <>
          <ActionIcon emoji="📊" label="Analítica" onClick={() => router.push('/tpv/analytics')} />
          <ActionIcon emoji="📉" label="Mermas" onClick={() => router.push('/tpv/mermas')} />
        </>
      )}

      {isAdmin && (
        <>
          <div className="w-8 border-t border-[#e2e8f0] my-0.5" />
          {ADMIN_SHORTCUTS.map(({ emoji, label, href }) => (
            <ActionIcon key={href} emoji={emoji} label={label} onClick={() => toAdmin(href)} />
          ))}
        </>
      )}

      <div className="flex-1" />

      {isAdmin && (
        <ActionIcon emoji="👥" label="Empleados" onClick={() => toAdmin('/admin/configuracion#empleados-tpv')} />
      )}
      <ActionIcon emoji="⚖️" label="Legal" onClick={() => router.push('/tpv/legal')} />
      {isAdmin && (
        <ActionIcon emoji="🖥️" label="Admin" onClick={() => toAdmin('/admin')} />
      )}
    </aside>
  );
}
