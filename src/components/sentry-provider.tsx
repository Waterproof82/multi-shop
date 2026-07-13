'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface SentryProviderProps {
  empresaId: string | null;
}

export function SentryProvider({ empresaId }: Readonly<SentryProviderProps>) {
  useEffect(() => {
    if (empresaId) {
      Sentry.setTag('empresa_id', empresaId);
    }
  }, [empresaId]);

  return null;
}
