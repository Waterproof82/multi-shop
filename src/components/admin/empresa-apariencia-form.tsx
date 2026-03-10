'use client';

import { useState, useEffect } from 'react';
import { Languages, ChevronDown, ChevronRight } from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';
import type { UpdateEmpresaDTO } from '@/core/application/dtos/empresa.dto';

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
    url_image: string | null;
    descripcion_es: string;
    descripcion_en: string;
    descripcion_fr: string;
    descripcion_it: string;
    descripcion_de: string;
  };
  readonly empresaSlug: string;
}

async function saveEmpresa(data: Partial<UpdateEmpresaDTO>) {
  const res = await fetch('/api/admin/empresa', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export function EmpresaAparienciaForm({ initialData, empresaSlug }: EmpresaAparienciaFormProps) {
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [showTranslations, setShowTranslations] = useState(false);

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleImageChange = async (url: string) => {
    const newUrl = url || null;
    setFormData((prev) => ({ ...prev, url_image: newUrl }));
    setSaved(false);
    setSavingImage(true);
    try {
      await saveEmpresa({ url_image: newUrl });
    } catch (error) {
      console.error('Error guardando imagen:', error);
    } finally {
      setSavingImage(false);
    }
  };

  const handleLogoChange = async (url: string) => {
    const newUrl = url || null;
    setFormData((prev) => ({ ...prev, logo_url: newUrl }));
    setSaved(false);
    setSavingLogo(true);
    try {
      await saveEmpresa({ logo_url: newUrl });
    } catch (error) {
      console.error('Error guardando logo:', error);
    } finally {
      setSavingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await saveEmpresa(formData);
      if (ok) setSaved(true);
    } catch (error) {
      console.error('Error guardando apariencia:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo de la empresa */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Logo de la empresa
          {savingLogo && <span className="ml-2 text-xs text-gray-400">Guardando...</span>}
        </p>
        <ImageUploader
          value={formData.logo_url ?? ''}
          onChange={handleLogoChange}
          label=""
          empresaSlug={empresaSlug}
          previewClassName="relative group rounded-lg overflow-hidden border"
          previewStyle={{ aspectRatio: '1/1', maxWidth: '200px' }}
        />
        <p className="text-xs text-gray-500 mt-1">
          Se mostrará en el header y footer del menú. Recomendado: 512×512px (cuadrado).
        </p>
      </div>

      {/* Imagen de fondo */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Imagen de fondo del banner
          {savingImage && <span className="ml-2 text-xs text-gray-400">Guardando...</span>}
        </p>
        <ImageUploader
          value={formData.url_image ?? ''}
          onChange={handleImageChange}
          label=""
          empresaSlug={empresaSlug}
          previewClassName="relative group rounded-lg overflow-hidden border w-full"
          previewStyle={{ aspectRatio: '16/5' }}
        />
        <p className="text-xs text-gray-500 mt-1">
          Se mostrará como fondo del banner principal. Recomendado: 1920×600px.
        </p>
      </div>

      {/* Descripción — idioma principal (ES) siempre visible */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Descripción del restaurante
        </p>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="descripcion_es"
            className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
          >
            Español
          </label>
          <textarea
            id="descripcion_es"
            rows={3}
            value={formData.descripcion_es}
            onChange={(e) => { setSaved(false); setFormData((prev) => ({ ...prev, descripcion_es: e.target.value })); }}
            placeholder="Descripción en Español..."
            className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm resize-y min-h-[72px]"
          />
        </div>
      </div>

      {/* Traducciones colapsables */}
      <div>
        <button
          type="button"
          onClick={() => setShowTranslations(!showTranslations)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary dark:hover:text-primary"
        >
          {showTranslations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Languages className="h-4 w-4" />
          Traducciones ({showTranslations ? 'ocultar' : 'mostrar'})
        </button>

        {showTranslations && (
          <div className="mt-3 space-y-3">
            {IDIOMAS.filter(({ key }) => key !== 'es').map(({ key, label }) => {
              const field = `descripcion_${key}` as keyof typeof formData;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label
                    htmlFor={`descripcion_${key}`}
                    className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                  >
                    {label}
                  </label>
                  <textarea
                    id={`descripcion_${key}`}
                    rows={3}
                    value={(formData[field] as string) || ''}
                    onChange={(e) => { setSaved(false); setFormData((prev) => ({ ...prev, [field]: e.target.value })); }}
                    placeholder={`Descripción en ${label}...`}
                    className="px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white text-sm resize-y min-h-[72px]"
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
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Guardando...' : 'Guardar descripciones'}
        </button>
        {saved && (
          <span className="text-green-600 text-sm">¡Guardado correctamente!</span>
        )}
      </div>
    </form>
  );
}
