"use client";

import { TranslatableField, type TranslatableTextValue } from "@/components/admin/landing/translatable-field";
import { ListaImagenesCampo } from "@/components/admin/landing/lista-imagenes-campo";
import { ADMIN_LABEL_CLASS as LABEL_CLASS } from "@/components/admin/admin-styles";
import type { MarqueeModo } from "@/components/landing/marquee";
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const MODOS: { modo: MarqueeModo; labelKey: Parameters<typeof t>[0] }[] = [
  { modo: "palabras", labelKey: "cintaWords" },
  { modo: "imagenes", labelKey: "cintaIcons" },
];

function modoClass(activo: boolean): string {
  if (activo) return "bg-cyan-500/20 text-cyan-300 border-cyan-400/40";
  return "text-slate-300 border-white/20 hover:bg-white/10 hover:text-white";
}

interface CintaCampoProps {
  label: string;
  contenido: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

// Cinta animada del hero: el admin elige si corre texto o iconos/imágenes.
// Se guardan ambos valores, así cambiar de modo no pierde lo ya cargado.
export function CintaCampo({ label, contenido, onChange }: Readonly<CintaCampoProps>) {
  const { language } = useLanguage();
  const modo: MarqueeModo = contenido.marqueeModo === "imagenes" ? "imagenes" : "palabras";
  const imagenes = (contenido.marqueeImagenes as string[] | undefined) ?? [];

  return (
    <fieldset className="space-y-3">
      <legend className={LABEL_CLASS}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {MODOS.map((opcion) => (
          <button
            key={opcion.modo}
            type="button"
            aria-pressed={modo === opcion.modo}
            onClick={() => onChange("marqueeModo", opcion.modo)}
            className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium ${modoClass(modo === opcion.modo)}`}
          >
            {t(opcion.labelKey, language)}
          </button>
        ))}
      </div>

      {modo === "palabras" ? (
        <TranslatableField
          label={t("cintaWordsLabel", language)}
          value={contenido.marquee as TranslatableTextValue | undefined}
          onChange={(next) => onChange("marquee", next)}
        />
      ) : (
        <ListaImagenesCampo
          label={t("cintaIconLabel", language)}
          imagenes={imagenes}
          onChange={(next) => onChange("marqueeImagenes", next)}
        />
      )}
    </fieldset>
  );
}
