'use client';

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

/** Textos de la 404. Cliente: el idioma vive en el navegador, no en el servidor. */
export function NotFoundContent() {
  const { language } = useLanguage();
  return (
    <div className="text-center max-w-md">
      <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
      <p className="text-lg font-semibold text-foreground mb-2">
        {t("notFoundTitle", language)}
      </p>
      <p className="text-muted-foreground mb-8">
        {t("notFoundDescription", language)}
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("notFoundBackHome", language)}
      </Link>
    </div>
  );
}

export function NotFoundFooter({ nombre }: Readonly<{ nombre: string }>) {
  const { language } = useLanguage();
  return (
    <p className="mt-8 text-sm text-muted-foreground text-center">
      {nombre} - {t("notFoundDigitalMenu", language)}
    </p>
  );
}
