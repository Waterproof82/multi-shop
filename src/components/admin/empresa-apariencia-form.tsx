'use client';

import { useState, useEffect } from 'react';
import { Languages, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';
import { PillSwitch } from '@/components/ui/pill-switch';
import { Textarea } from '@/components/ui/textarea';
import type { UpdateEmpresaDTO } from '@/core/application/dtos/empresa.dto';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const IDIOMAS = [
  { key: 'es', label: 'Español' },
  { key: 'en', label: 'English' },
  { key: 'fr', label: 'Français' },
  { key: 'it', label: 'Italiano' },
  { key: 'de', label: 'Deutsch' },
] as const;

interface EmpresaAparienciaFormProps {
  readonly initialData: {
    logo_url: string | null;
    mostrar_logo: boolean;
    url_image: string | null;
    banner_fit: "contain" | "cover" | "fill" | null;
    descripcion_es: string;
    descripcion_en: string;
    descripcion_fr: string;
    descripcion_it: string;
    descripcion_de: string;
  };
  readonly empresaSlug: string;
}

async function saveEmpresa(data: Partial<UpdateEmpresaDTO>) {
  const res = await fetchWithCsrf('/api/admin/empresa', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.ok;
}

export function EmpresaAparienciaForm({ initialData, empresaSlug }: EmpresaAparienciaFormProps) {
  const { language } = useLanguage();
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const idiomas = [
    { key: 'es', label: t('languageSpanish', language) },
    { key: 'en', label: t('languageEnglish', language) },
    { key: 'fr', label: t('languageFrench', language) },
    { key: 'it', label: t('languageItalian', language) },
    { key: 'de', label: t('languageGerman', language) },
  ] as const;
  const [showTranslations, setShowTranslations] = useState(false);

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleImageChange = async (url = '') => {
    const newUrl = url || null;
    setFormData((prev) => ({ ...prev, url_image: newUrl }));
    setSaved(false);
    setSavingImage(true);
    setImageError(null);
    try {
      const ok = await saveEmpresa({ url_image: newUrl });
      if (!ok) setImageError('Error al guardar la imagen');
    } catch (error) {
      logClientError(error, 'handleImageChange');
      setImageError('Error al guardar la imagen');
    } finally {
      setSavingImage(false);
    }
  };

  const handleLogoChange = async (url = '') => {
    const newUrl = url || null;
    setFormData((prev) => ({ ...prev, logo_url: newUrl }));
    setSaved(false);
    setSavingLogo(true);
    setLogoError(null);
    try {
      const ok = await saveEmpresa({ logo_url: newUrl });
      if (!ok) setLogoError('Error al guardar el logo');
    } catch (error) {
      logClientError(error, 'handleLogoChange');
      setLogoError('Error al guardar el logo');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleBannerFitChange = async (fit: "contain" | "cover" | "fill") => {
    setFormData((prev) => ({ ...prev, banner_fit: fit }));
    setSaved(false);
    try {
      const ok = await saveEmpresa({ banner_fit: fit });
      if (!ok) setImageError('Error al guardar el ajuste');
    } catch (error) {
      logClientError(error, 'handleBannerFitChange');
      setImageError('Error al guardar el ajuste');
    }
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await saveEmpresa(formData);
      if (ok) setSaved(true);
    } catch (error) {
      logClientError(error, 'handleSubmit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo de la empresa */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">
          {t('companyLogo', language)}
          {savingLogo && <span className="ml-2 text-xs text-muted-foreground">{t('savingProgress', language)}</span>}
          {logoError && <span className="ml-2 text-xs text-destructive" role="alert">{logoError}</span>}
        </p>
        <ImageUploader
          value={formData.logo_url ?? ''}
          onChange={handleLogoChange}
          label=""
          empresaSlug={empresaSlug}
          previewClassName="relative group rounded-lg overflow-hidden border aspect-square w-48 max-w-48"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('logoHelp', language)}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <PillSwitch
            checked={formData.mostrar_logo ?? true}
            onChange={async () => {
              const newValue = !(formData.mostrar_logo ?? true);
              setFormData((prev) => ({ ...prev, mostrar_logo: newValue }));
              setSaved(false);
              try {
                const ok = await saveEmpresa({ mostrar_logo: newValue });
                if (!ok) setLogoError('Error al guardar');
              } catch (error) {
                logClientError(error, 'toggleLogo');
                setLogoError('Error al guardar');
              }
            }}
            ariaLabel="Mostrar logo en el banner"
            size="sm"
          />
          <span className="text-sm text-muted-foreground">Mostrar logo en el banner</span>
        </div>
      </div>

      {/* Imagen de fondo */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">
          {t('bannerBackground', language)}
          {savingImage && <span className="ml-2 text-xs text-muted-foreground">{t('savingProgress', language)}</span>}
          {imageError && <span className="ml-2 text-xs text-destructive" role="alert">{imageError}</span>}
        </p>
        <ImageUploader
          value={formData.url_image ?? ''}
          onChange={handleImageChange}
          label=""
          empresaSlug={empresaSlug}
          previewClassName="relative group rounded-lg overflow-hidden border w-full aspect-video max-h-48"
          isBannerImage
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('bannerHelp', language)}
        </p>
        <select
          id="banner_fit"
          value={formData.banner_fit ?? 'contain'}
          onChange={(e) => handleBannerFitChange(e.target.value as "contain" | "cover" | "fill")}
          className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="contain">{t('bannerFitContain', language)}</option>
          <option value="cover">{t('bannerFitCover', language)}</option>
          <option value="fill">{t('bannerFitFill', language)}</option>
        </select>
      </div>

      {/* Descripción — idioma principal (ES) siempre visible */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">
          {t('restaurantDescription', language)}
        </p>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="descripcion_es"
            className="text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wide"
          >
            {t('languageSpanish', language)}
          </label>
          <Textarea
            id="descripcion_es"
            rows={3}
            value={formData.descripcion_es}
            onChange={(e) => { setSaved(false); setFormData((prev) => ({ ...prev, descripcion_es: e.target.value })); }}
            placeholder={`${t('restaurantDescription', language).toLowerCase()} ${t('languageSpanish', language).toLowerCase()}...`}
          />
        </div>
      </div>

      {/* Traducciones colapsables */}
      <div>
        <button
          type="button"
          onClick={() => setShowTranslations(!showTranslations)}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary dark:hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {showTranslations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Languages className="h-4 w-4" />
          {t('translationsToggle', language)} ({showTranslations ? t('hideLabel', language) : t('showLabel', language)})
        </button>

        {showTranslations && (
          <div className="mt-3 space-y-3">
            {idiomas.filter(({ key }) => key !== 'es').map(({ key, label }) => {
              const field = `descripcion_${key}` as keyof typeof formData;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label
                    htmlFor={`descripcion_${key}`}
                    className="text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wide"
                  >
                    {label}
                  </label>
                  <Textarea
                    id={`descripcion_${key}`}
                    rows={3}
                    value={(formData[field] as string) || ''}
                    onChange={(e) => { setSaved(false); setFormData((prev) => ({ ...prev, [field]: e.target.value })); }}
                    placeholder={`${t('restaurantDescription', language).toLowerCase()} ${label.toLowerCase()}...`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px] flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {saving ? t('savingProgress', language) : t('saveDescriptions', language)}
        </button>
        {saved && (
          <span className="text-primary text-sm">{t('savedSuccess', language)}</span>
        )}
      </div>
    </form>
  );
}
