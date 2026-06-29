'use client';

import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const onOffline = () => setIsOffline(true);
    const onOnline = () => { setIsOffline(false); globalThis.location.reload(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      <span>⚠</span>
      <span>Sin conexión — los datos pueden no estar actualizados</span>
    </div>
  );
}
