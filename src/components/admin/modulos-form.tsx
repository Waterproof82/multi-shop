'use client';

import { useState, useEffect } from 'react';
import { Megaphone, ShoppingBag } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { useAdmin } from '@/lib/admin-context';
import { PillSwitch } from '@/components/ui/pill-switch';

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  const displayChecked = mounted ? checked : false;

  return (
    <label className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-colors cursor-pointer ${displayChecked ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/30'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${displayChecked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <PillSwitch
        checked={displayChecked}
        disabled={disabled}
        onChange={() => !disabled && onChange(!checked)}
        size="md"
      />
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
