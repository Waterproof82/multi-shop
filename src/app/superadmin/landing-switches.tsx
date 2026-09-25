'use client';

import { useState } from 'react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { PillSwitch } from '@/components/ui/pill-switch';
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from '@/core/domain/entities/types';

const TIPO_LABELS: Record<LandingSeccionTipo, string> = {
  hero: 'Hero',
  nosotros: 'Nosotros',
  cta_carta: 'Carta',
  testimonio: 'Testimonio',
  galeria: 'Galería',
  visitanos: 'Visítanos',
};

interface SeccionSwitchProps {
  readonly empresaId: string;
  readonly empresaNombre: string;
  readonly tipo: LandingSeccionTipo;
  readonly initialChecked: boolean;
}

function SeccionSwitch({ empresaId, empresaNombre, tipo, initialChecked }: Readonly<SeccionSwitchProps>) {
  const [checked, setChecked] = useState(initialChecked);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saving) return;
    const next = !checked;
    setChecked(next);
    setSaving(true);
    try {
      // Solo `activo`: el contenido lo edita el admin del tenant en /admin/landing.
      const res = await fetchWithCsrf(`/api/admin/landing-secciones/${tipo}?empresaId=${empresaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: next }),
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
      <span className="text-xs text-slate-300">{TIPO_LABELS[tipo]}</span>
      <PillSwitch
        checked={checked}
        disabled={saving}
        onChange={() => void handleToggle()}
        ariaLabel={`Sección ${TIPO_LABELS[tipo]} de ${empresaNombre}`}
        size="sm"
      />
    </div>
  );
}

interface LandingSwitchesProps {
  readonly empresaId: string;
  readonly empresaNombre: string;
  readonly activas: readonly LandingSeccionTipo[];
}

export function LandingSwitches({ empresaId, empresaNombre, activas }: Readonly<LandingSwitchesProps>) {
  return (
    <div className="grid w-36 grid-cols-1 gap-1" role="group" aria-label={`Secciones de landing de ${empresaNombre}`}>
      {LANDING_SECCION_TIPOS.map((tipo) => (
        <SeccionSwitch
          key={tipo}
          empresaId={empresaId}
          empresaNombre={empresaNombre}
          tipo={tipo}
          initialChecked={activas.includes(tipo)}
        />
      ))}
    </div>
  );
}
