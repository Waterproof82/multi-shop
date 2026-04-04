'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function UrlCleanup() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.has('t')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('t');
      router.replace(url.pathname + url.search);
    }
  }, [router, searchParams]);

  return null;
}
