'use client';

import { useState } from 'react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { PillSwitch } from '@/components/ui/pill-switch';

interface LandingSwitchProps {
  readonly empresaId: string;
  readonly empresaNombre: string;
  readonly initialChecked: boolean;
}

export function LandingSwitches({ empresaId, empresaNombre, initialChecked }: Readonly<LandingSwitchProps>) {
  const [checked, setChecked] = useState(initialChecked);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saving) return;
    const next = !checked;
    setChecked(next);
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/empresas/${empresaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landing_habilitada: next }),
      });
      if (!res.ok) setChecked(!next);
    } catch {
      setChecked(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-300">Página de Inicio</span>
      <PillSwitch
        checked={checked}
        disabled={saving}
        onChange={() => void handleToggle()}
        ariaLabel={`Página de Inicio de ${empresaNombre}`}
        size="sm"
      />
    </div>
  );
}
