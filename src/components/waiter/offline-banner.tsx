'use client';

import { useEffect, useState } from 'react';

// Ping the server until it responds, then reload to get fresh data.
// Retries every 2s — handles Android firing 'online' before network is stable.
function reloadWhenReady() {
  fetch('/api/waiter/me', { cache: 'no-store' })
    .then(() => { globalThis.location.reload(); })
    .catch(() => { setTimeout(reloadWhenReady, 2000); });
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const onOffline = () => setIsOffline(true);
    const onOnline = () => { setIsOffline(false); reloadWhenReady(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-slate-900 px-10 py-8 text-center shadow-2xl">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 20.25h.008v.008H12v-.008z" />
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"/>
        </svg>
        <p className="text-lg font-bold text-white">Sin conexión</p>
        <p className="text-sm text-slate-400">Esperando conectividad…</p>
      </div>
    </div>
  );
}
