'use client';

import { useState, useEffect } from 'react';

interface SuperadminBannerProps {
  empresaNombre: string;
}

export function SuperadminBanner({ empresaNombre }: SuperadminBannerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything on server to avoid hydration mismatch
  // The banner will only show after client-side hydration
  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-6 py-3">
      <div className="lg:ml-64 flex items-center justify-between">
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <span className="font-medium">Modo superadmin:</span> Gestionando <strong className="font-semibold">{empresaNombre}</strong>
        </div>
        <a
          href="/superadmin"
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-xs font-medium bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 rounded-md transition-colors flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Volver al panel
        </a>
      </div>
    </div>
  );
}
