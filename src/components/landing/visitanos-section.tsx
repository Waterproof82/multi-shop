"use client";

import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface VisitanosSectionProps {
  contenido: Record<string, unknown>;
  empresa: EmpresaPublic;
}

export function VisitanosSection({ contenido, empresa }: Readonly<VisitanosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavWhereWeAre", language);
  const horario = readTranslatable(contenido, "horario", language);

  return (
    <section id="donde-estamos" className="mx-auto w-full max-w-3xl px-4 py-16">
      {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
      <h2 className="mb-4 text-2xl font-bold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-base text-muted-foreground">
        {empresa.direccion && <p>{empresa.direccion}</p>}
        {empresa.telefono && <p>{empresa.telefono}</p>}
        {horario && <p>{horario}</p>}
      </div>
      {empresa.urlMapa && (
        <div className="mt-6 h-80 w-full overflow-hidden rounded-lg border border-border">
          <iframe
            title={t("locationIframe", language)}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={empresa.urlMapa}
          />
        </div>
      )}
    </section>
  );
}
