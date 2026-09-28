'use client';

import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ reset }: Readonly<ErrorPageProps>) {
  const { language } = useLanguage();
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
      <div className="mb-4 text-4xl" role="img" aria-label={t("errorIconLabel", language)}>⚠️</div>
      <h2 className="mb-2 text-lg font-semibold text-destructive">
        {t("errorTitle", language)}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground max-w-md">
        {t("errorDescRetry", language)}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("errorRetry", language)}
      </button>
    </div>
  );
}
