"use client";

import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/ui/image-uploader";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import {
  ADMIN_LABEL_CLASS as LABEL_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS as OUTLINE_BUTTON_CLASS,
} from "@/components/admin/admin-styles";

// Mismo tope que el DTO (`.max(20)`): por encima, el PUT devolvería 400.
const MAX_IMAGENES = 20;

// ImageUploader es compartido y usa tokens del tema; aca lo aclaramos solo dentro de este fondo oscuro.
export const UPLOADER_WRAPPER_CLASS = "[&_label]:text-white [&_span]:text-slate-300";

interface ListaImagenesCampoProps {
  label: string;
  imagenes: string[];
  onChange: (imagenes: string[]) => void;
}

export function ListaImagenesCampo({ label, imagenes, onChange }: Readonly<ListaImagenesCampoProps>) {
  const { language } = useLanguage();

  function reemplazar(idx: number, url: string) {
    const next = [...imagenes];
    next[idx] = url;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <span className={LABEL_CLASS}>{label}</span>
      <div className="space-y-3">
        {imagenes.map((url, idx) => (
          <div key={idx} className={`flex items-start gap-2 ${UPLOADER_WRAPPER_CLASS}`}>
            <ImageUploader value={url} onChange={(nuevaUrl) => reemplazar(idx, nuevaUrl)} label={`${label} ${idx + 1}`} />
            <Button
              variant="outline"
              size="sm"
              className={OUTLINE_BUTTON_CLASS}
              onClick={() => onChange(imagenes.filter((_, i) => i !== idx))}
            >
              {t("remove", language)}
            </Button>
          </div>
        ))}
        {imagenes.length < MAX_IMAGENES && (
          <Button variant="outline" size="sm" className={OUTLINE_BUTTON_CLASS} onClick={() => onChange([...imagenes, ""])}>
            + {t("landingSeccionAgregarImagen", language)}
          </Button>
        )}
      </div>
    </div>
  );
}
