'use client';

import { useState } from 'react';
import { Megaphone, ShoppingBag } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { useAdmin } from '@/lib/admin-context';

interface ModulosFormProps {
  readonly empresaId: string;
  readonly mostrarPromociones: boolean;
  readonly mostrarTgtg: boolean;
}

interface ModuloToggleProps {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}

function ModuloToggle({ icon: Icon, label, description, checked, disabled, onChange }: ModuloToggleProps) {
  return (
    <label className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-colors cursor-pointer ${checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/30'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checked ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </label>
  );
}

export function ModulosForm({ empresaId, mostrarPromociones: initialPromo, mostrarTgtg: initialTgtg }: ModulosFormProps) {
  const { language } = useLanguage();
  const { overrideEmpresaId } = useAdmin();
  const [mostrarPromociones, setMostrarPromociones] = useState(initialPromo);
  const [mostrarTgtg, setMostrarTgtg] = useState(initialTgtg);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleToggle = async (field: 'mostrar_promociones' | 'mostrar_tgtg', value: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const url = overrideEmpresaId
      ? `/api/admin/empresa?empresaId=${overrideEmpresaId}`
      : '/api/admin/empresa';

    const res = await fetchWithCsrf(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });

    setSaving(false);

    if (!res.ok) {
      setError('Error al guardar los cambios');
      return;
    }

    if (field === 'mostrar_promociones') setMostrarPromociones(value);
    else setMostrarTgtg(value);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="space-y-3">
      <ModuloToggle
        icon={Megaphone}
        label={t('configModuloPromociones', language)}
        description={t('configModuloPromocionesDesc', language)}
        checked={mostrarPromociones}
        disabled={saving}
        onChange={(v) => handleToggle('mostrar_promociones', v)}
      />
      <ModuloToggle
        icon={ShoppingBag}
        label={t('configModuloTgtg', language)}
        description={t('configModuloTgtgDesc', language)}
        checked={mostrarTgtg}
        disabled={saving}
        onChange={(v) => handleToggle('mostrar_tgtg', v)}
      />
      {error && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600 mt-2">{t('contactDataSaved', language)}</p>
      )}
    </div>
  );
}
