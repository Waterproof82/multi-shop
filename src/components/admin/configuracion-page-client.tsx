'use client';

import { Settings, Palette, Building2, ToggleLeft } from 'lucide-react';
import { ColoresForm } from '@/components/admin/colores-form';
import { EmpresaDatosForm } from '@/components/admin/empresa-datos-form';
import { EmpresaAparienciaForm } from '@/components/admin/empresa-apariencia-form';
import { ModulosForm } from '@/components/admin/modulos-form';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { EmpresaColores } from '@/core/domain/entities/types';

interface EmpresaDatos {
  email_notification: string;
  telefono_whatsapp: string;
  fb: string;
  instagram: string;
  url_mapa: string;
  direccion: string;
}

interface EmpresaApariencia {
  logo_url: string | null;
  url_image: string | null;
  descripcion_es: string;
  descripcion_en: string;
  descripcion_fr: string;
  descripcion_it: string;
  descripcion_de: string;
}

interface ConfiguracionPageClientProps {
  empresaNombre: string;
  empresaId: string;
  empresaSlug: string;
  empresaDatos: EmpresaDatos;
  empresaApariencia: EmpresaApariencia;
  colores: EmpresaColores | null;
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
}

export function ConfiguracionPageClient({
  empresaNombre,
  empresaId,
  empresaSlug,
  empresaDatos,
  empresaApariencia,
  colores,
  mostrarPromociones,
  mostrarTgtg,
}: Readonly<ConfiguracionPageClientProps>) {
  const { language } = useLanguage();

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("sidebarSettings", language)}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{empresaNombre}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-xs text-primary-foreground/80">{t("configCompanyLabel", language)}</span>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Palette className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-xs text-primary-foreground/80">{t("configAparienciaLabel", language)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Datos de la empresa */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          {t("configContactTitle", language)}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t("configContactHelp", language)}
        </p>
        <EmpresaDatosForm initialData={empresaDatos} />
      </div>

      {/* Apariencia */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground">
          {t("configAparienciaTitle", language)}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t("configAparienciaHelp", language)}
        </p>
        <EmpresaAparienciaForm initialData={empresaApariencia} empresaSlug={empresaSlug} />
      </div>

      {/* Módulos */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground flex items-center gap-2">
          <ToggleLeft className="w-5 h-5" />
          {t("configModulosTitle", language)}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t("configModulosHelp", language)}
        </p>
        <ModulosForm
          empresaId={empresaId}
          mostrarPromociones={mostrarPromociones}
          mostrarTgtg={mostrarTgtg}
        />
      </div>

      {/* Colores */}
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground">
          {t("configColoresTitle", language)}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t("configColoresHelp", language)}
        </p>
        <ColoresForm
          coloresIniciales={colores}
          empresaId={empresaId}
        />
      </div>
    </div>
  );
}
