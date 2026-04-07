'use client';

import { useState, useEffect } from 'react';
import { Gift, Clock } from 'lucide-react';
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
  readonly descuentoBienvenidaDuracion?: number | null;
}

const DURACION_OPTIONS: { value: number; labelKey: 'adminWelcomeDiscountDuracion7' | 'adminWelcomeDiscountDuracion14' | 'adminWelcomeDiscountDuracion30' | 'adminWelcomeDiscountDuracion60' | 'adminWelcomeDiscountDuracion90' }[] = [
  { value: 7, labelKey: 'adminWelcomeDiscountDuracion7' },
  { value: 14, labelKey: 'adminWelcomeDiscountDuracion14' },
  { value: 30, labelKey: 'adminWelcomeDiscountDuracion30' },
  { value: 60, labelKey: 'adminWelcomeDiscountDuracion60' },
  { value: 90, labelKey: 'adminWelcomeDiscountDuracion90' },
];

export function DescuentoBienvenidaForm({
  empresaId: _empresaId,
  descuentoBienvenidaActivo: initialActivo,
  descuentoBienvenidaPorcentaje: initialPorcentaje,
  descuentoBienvenidaDuracion: initialDuracion,
}: DescuentoBienvenidaFormProps) {
  const { language } = useLanguage();
  const { overrideEmpresaId } = useAdmin();
  const [activo, setActivo] = useState(initialActivo);
  const [porcentaje, setPorcentaje] = useState(String(initialPorcentaje));
  const [duracion, setDuracion] = useState(initialDuracion || 30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const displayActivo = mounted ? activo : false;

  const save = async (newActivo: boolean, newPorcentaje: string, newDuracion: number) => {
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
        descuento_bienvenida_duracion: newDuracion,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      setError(t('errorSaving', language));
      return;
    }

    setActivo(newActivo);
    setPorcentaje(String(numPorcentaje));
    setDuracion(newDuracion);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleToggle = (value: boolean) => {
    if (saving) return;
    save(value, porcentaje, duracion);
  };

  const handlePorcentajeBlur = () => {
    if (saving) return;
    save(activo, porcentaje, duracion);
  };

  const handleDuracionChange = (value: number) => {
    if (saving) return;
    save(activo, porcentaje, value);
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
        <div className="pl-2 space-y-4">
          <div>
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
            <p className="text-xs text-muted-foreground mt-1">
              {t('adminWelcomeDiscountPercentageHelp', language)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {t('adminWelcomeDiscountDuracion', language)}
            </label>
            <select
              value={duracion}
              onChange={(e) => handleDuracionChange(Number(e.target.value))}
              disabled={saving}
              className="h-9 text-sm max-w-[200px] rounded-md border border-input bg-background px-3 py-1"
              aria-label={t('adminWelcomeDiscountDuracion', language)}
            >
              {DURACION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey, language)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{t('contactDataSaved', language)}</p>}
    </div>
  );
}