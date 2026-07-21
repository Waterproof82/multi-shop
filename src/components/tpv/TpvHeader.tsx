'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, Lock } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/tpv/useOnlineStatus';
import { getQueueCount } from '@/lib/tpv/offline-queue';
import { LowStockBadge } from '@/components/tpv/LowStockBadge';
import { useTpvRol, useTpvIsEmployeeSession } from '@/lib/tpv-rol-ctx';
import { fetchWithCsrf } from '@/lib/csrf-client';


interface Props {
  readonly empresaNombre: string;
}

function TpvClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    function tick() {
      const d = new Date();
      setTime(
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0')
      );
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-semibold tabular-nums text-sm">{time}</span>;
}

export function TpvHeader({ empresaNombre }: Readonly<Props>) {
  const pathname = usePathname();
  const router = useRouter();
  const rol = useTpvRol();
  const isEmployeeSession = useTpvIsEmployeeSession();
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [locking, setLocking] = useState(false);

  const isCajero = rol === 'cajero';
  const showGear = rol === 'admin' || rol === 'superadmin' || rol === 'encargado';

  const NAV_ITEMS = [
    { label: '🛒 Mostrador', href: '/tpv/mostrador', activePrefix: '/tpv/mostrador' },
    { label: '🪑 Mesas',     href: '/tpv/mesas?seleccionar=1', activePrefix: '/tpv/mesas' },
    ...(!isCajero ? [{ label: '📋 Historial', href: '/tpv/historial', activePrefix: '/tpv/historial' }] : []),
  ];

  useEffect(() => {
    getQueueCount()
      .then(setPendingCount)
      .catch(() => { /* IndexedDB not available */ });
  }, [isOnline]);

  async function handleLock() {
    setLocking(true);
    await fetchWithCsrf('/api/tpv/empleados/logout', { method: 'POST' });
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = '/tpv/login';
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="print:hidden">
    {!isOnline && (
      <div className="flex items-center justify-center gap-2 h-8 px-4 bg-[#f59e0b] text-black text-xs font-semibold shrink-0">
        <span>Sin conexión — modo local</span>
        {pendingCount > 0 && (
          <span className="bg-black text-[#f59e0b] rounded-full px-2 py-0.5 text-[10px] font-bold">
            {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    )}
    <header className="flex items-center justify-between h-14 px-5 bg-white border-b border-[#e2e8f0] shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-bold text-[#2563eb] text-sm tracking-wide">TPV</span>
        <span className="text-xs text-[#64748b]">{empresaNombre}</span>
      </div>

      <nav className="flex gap-1">
        {NAV_ITEMS.map(({ label, href, activePrefix }) => (
          <button
            key={href}
            type="button"
            onClick={() => router.push(href)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith(activePrefix)
                ? 'bg-[#eff6ff] text-[#1e40af] border border-[#93c5fd]'
                : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <LowStockBadge />
        <TpvClock />
        {isEmployeeSession && (
          <button
            type="button"
            onClick={handleLock}
            disabled={locking}
            aria-label="Bloquear TPV"
            className="p-1.5 rounded-md border bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-2">
          {showGear && (
            <button
              type="button"
              onClick={() => { window.location.href = '/admin'; }}
              aria-label="Ir al panel de administración"
              className="p-1.5 rounded-md border bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#2563eb] hover:text-[#0f172a] transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/tpv/turno/cerrar')}
            className="text-xs bg-[#fef2f2] border border-[#fca5a5] text-[#ef4444] px-3 py-1.5 rounded-md hover:bg-[#fee2e2] transition-colors flex items-center gap-1.5"
          >
            <span aria-hidden="true">⏻</span>
            Cierre de Caja
          </button>
        </div>
      </div>
    </header>
    </div>
  );
}
