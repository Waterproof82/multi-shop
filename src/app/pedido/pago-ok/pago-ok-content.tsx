'use client';

import { CheckCircle } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

/** Confirmación sin enlace de seguimiento. Cliente: el idioma vive en el navegador. */
export function PagoOkContent() {
  const { language } = useLanguage();
  return (
    <div className="max-w-sm w-full text-center space-y-4">
      <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
      <h1 className="text-2xl font-bold">{t('paymentOkTitle', language)}</h1>
      <p className="text-muted-foreground">
        {t('paymentOkDescription', language)}
      </p>
    </div>
  );
}
