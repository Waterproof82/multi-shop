'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { EmpresaColores } from '@/core/domain/entities/types';
import { DEFAULT_EMPRESA_COLORES } from '@/core/domain/constants/empresa-defaults';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface ColoresFormProps {
  readonly coloresIniciales: EmpresaColores | null;
  readonly empresaId: string;
}

type ColorKey = keyof EmpresaColores;

const COLOR_KEY_TRANSLATION: Record<ColorKey, Parameters<typeof t>[0]> = {
  primary: 'colorPrimary',
  primaryForeground: 'colorPrimaryForeground',
  secondary: 'colorSecondary',
  secondaryForeground: 'colorSecondaryForeground',
  accent: 'colorAccent',
  accentForeground: 'colorAccentForeground',
  background: 'colorBackground',
  foreground: 'colorForeground',
};

export function ColoresForm({ coloresIniciales, empresaId }: ColoresFormProps) {
  const { language } = useLanguage();
  const [colores, setColores] = useState<EmpresaColores>({ ...DEFAULT_EMPRESA_COLORES });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (coloresIniciales) {
      setColores(coloresIniciales);
    }
  }, [coloresIniciales]);

  const handleChange = (key: ColorKey, value: string) => {
    setColores((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetchWithCsrf('/api/admin/update-colores', {
        method: 'POST',
        body: JSON.stringify({ empresaId, colores }),
      });

      if (res.ok) {
        setSaved(true);
        globalThis.location.reload();
      }
    } catch (error) {
      logClientError(error, 'handleSubmit');
    } finally {
      setSaving(false);
    }
  };

  const colorKeys: ColorKey[] = [
    'primary',
    'primaryForeground',
    'secondary',
    'secondaryForeground',
    'accent',
    'accentForeground',
    'background',
    'foreground',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {colorKeys.map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <label htmlFor={`color-picker-${key}`} className="text-sm font-medium text-foreground">
              {t(COLOR_KEY_TRANSLATION[key], language)}
            </label>
            <div className="flex gap-2">
              <input
                id={`color-picker-${key}`}
                name={`color-picker-${key}`}
                type="color"
                value={colores[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-12 h-10 rounded cursor-pointer border border-border"
              />
              <span id={`color-format-${key}`} className="sr-only">
                {t('colorHexFormatHelp', language)}
              </span>
              <input
                id={`color-text-${key}`}
                name={`color-text-${key}`}
                type="text"
                value={colores[key]}
                aria-describedby={`color-format-${key}`}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    handleChange(key, val);
                  }
                }}
                pattern="#[0-9A-Fa-f]{6}"
                maxLength={7}
                className="flex-1 px-3 py-2 border rounded-md bg-card border-border text-foreground text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px] flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {saving ? t('savingProgress', language) : t('saveColors', language)}
        </button>
        {saved && (
          <span className="text-primary text-sm">{t('colorsSavedSuccess', language)}</span>
        )}
      </div>

      <div className="mt-6 p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-3 text-foreground">{t('colorPreview', language)}</h4>
        <div
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: colores.background,
            borderColor: colores.secondary,
          }}
        >
          <h5
            className="text-lg font-bold mb-2"
            style={{ color: colores.primary }}
          >
            {t('colorPreviewTitle', language)}
          </h5>
          <p
            className="mb-3"
            style={{ color: colores.foreground }}
          >
            {t('colorPreviewText', language)}
          </p>
          <span
            className="inline-block px-3 py-1 rounded text-sm"
            style={{
              backgroundColor: colores.secondary,
              color: colores.secondaryForeground,
            }}
          >
            {t('colorPreviewSecondary', language)}
          </span>{' '}
          <span
            className="inline-block px-3 py-1 rounded text-sm"
            style={{
              backgroundColor: colores.accent,
              color: colores.accentForeground,
            }}
          >
            {t('colorPreviewAccent', language)}
          </span>
        </div>
      </div>
    </form>
  );
}
