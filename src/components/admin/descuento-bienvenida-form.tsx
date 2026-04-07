'use client';

import { useState, useEffect } from 'react';
import { Gift } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { useAdmin } from '@/lib/admin-context';
import { PillSwitch } from '@/components/ui/pill-switch';
import { Input } from '@/components/ui/input';

interface DescuentoBienvenidaFormProps {
  readonly empresaId: string;
  readonly descuentoBienvenidaActivo: boolean;
  readonly descuentoBienvenidaPorcentaje: number;
}

export function DescuentoBienvenidaForm({
  empresaId: _empresaId,
  descuentoBienvenidaActivo: initialActivo,
  descuentoBienvenidaPorcentaje: initialPorcentaje,
}: DescuentoBienvenidaFormProps) {
  const { language } = useLanguage();
  const { overrideEmpresaId } = useAdmin();
  const [activo, setActivo] = useState(initialActivo);
  const [porcentaje, setPorcentaje] = useState(String(initialPorcentaje));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const displayActivo = mounted ? activo : false;

  const save = async (newActivo: boolean, newPorcentaje: string) => {
    const numPorcentaje = parseFloat(newPorcentaje);
    if (isNaN(numPorcentaje) || numPorcentaje < 1 || numPorcentaje > 50) {
      setError(t('adminWelcomeDiscountPercentageError', language));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const url = overrideEmpresaId
      ? `/api/admin/empresa?empresaId=${overrideEmpresaId}`
      : '/api/admin/empresa';

    const res = await fetchWithCsrf(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descuento_bienvenida_activo: newActivo,
        descuento_bienvenida_porcentaje: numPorcentaje,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      setError(t('errorSaving', language));
      return;
    }

    setActivo(newActivo);
    setPorcentaje(String(numPorcentaje));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleToggle = (value: boolean) => {
    if (saving) return;
    save(value, porcentaje);
  };

  const handlePorcentajeBlur = () => {
    if (saving) return;
    save(activo, porcentaje);
  };

  return (
    <div className="space-y-4">
      <label
        className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-colors cursor-pointer ${displayActivo ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'} ${saving ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/30'}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${displayActivo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Gift className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('adminWelcomeDiscountToggle', language)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('adminWelcomeDiscountToggleDesc', language)}</p>
          </div>
        </div>
        <PillSwitch
          checked={displayActivo}
          disabled={saving}
          onChange={() => !saving && handleToggle(!activo)}
          size="md"
        />
      </label>

      {displayActivo && (
        <div className="pl-2">
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('adminWelcomeDiscountPercentage', language)}
          </label>
          <div className="flex items-center gap-2 max-w-[180px]">
            <Input
              type="number"
              min={1}
              max={50}
              step={0.5}
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              onBlur={handlePorcentajeBlur}
              disabled={saving}
              className="h-9 text-sm"
              aria-label={t('adminWelcomeDiscountPercentage', language)}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{t('contactDataSaved', language)}</p>}
    </div>
  );
}
