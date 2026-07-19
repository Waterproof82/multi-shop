'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Settings, Package, Tags, BookOpen, Archive, LayoutDashboard, Lock } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/tpv/useOnlineStatus';
import { getQueueCount } from '@/lib/tpv/offline-queue';
import { LowStockBadge } from '@/components/tpv/LowStockBadge';
import { useTpvRol, useTpvIsEmployeeSession } from '@/lib/tpv-rol-ctx';
import { fetchWithCsrf } from '@/lib/csrf-client';

const ADMIN_SHORTCUTS = [
  { label: 'Productos',    href: '/admin/productos',           icon: Package },
  { label: 'Categorías',  href: '/admin/categorias',          icon: Tags },
  { label: 'Recetas',     href: '/admin/stock/recetas',       icon: BookOpen },
  { label: 'Ingredientes',href: '/admin/stock/ingredientes',  icon: Archive },
  { label: 'Panel admin', href: '/admin',                     icon: LayoutDashboard },
] as const;

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

export function TpvHeader({ empresaNombre }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const rol = useTpvRol();
  const isEmployeeSession = useTpvIsEmployeeSession();
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);

  const isCajero = rol === 'cajero';
  const showGear = rol === 'admin' || rol === 'superadmin' || rol === 'encargado';

  const NAV_ITEMS = [
    { label: '🛒 Mostrador', href: '/tpv/mostrador', activePrefix: '/tpv/mostrador' },
    { label: '🪑 Mesas',     href: '/tpv/mesas?seleccionar=1', activePrefix: '/tpv/mesas' },
    ...(!isCajero ? [{ label: '📋 Historial', href: '/tpv/historial', activePrefix: '/tpv/historial' }] : []),
    ...(!isCajero ? [{ label: '📉 Mermas', href: '/tpv/mermas', activePrefix: '/tpv/mermas' }] : []),
  ];

  useEffect(() => {
    if (!adminOpen) return;
    function handleClick(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [adminOpen]);

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
    <header className="flex items-center justify-between h-14 px-5 bg-[#1a1d27] border-b border-[#2e3347] shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-bold text-[#4f72ff] text-sm tracking-wide">TPV</span>
        <span className="text-xs text-[#6b7280]">{empresaNombre}</span>
      </div>

      <nav className="flex gap-1">
        {NAV_ITEMS.map(({ label, href, activePrefix }) => (
          <button
            key={href}
            type="button"
            onClick={() => router.push(href)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith(activePrefix)
                ? 'bg-[#22263a] text-[#e8eaf0]'
                : 'text-[#6b7280] hover:text-[#e8eaf0]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <LowStockBadge />
        <TpvClock />
        {showGear && (
          <div ref={adminRef} className="relative">
            <button
              type="button"
              onClick={() => setAdminOpen(o => !o)}
              aria-label="Accesos de administración"
              aria-expanded={adminOpen}
              className={`p-1.5 rounded-md border transition-colors ${
                adminOpen
                  ? 'bg-[#2e3347] border-[#4f72ff] text-[#4f72ff]'
                  : 'bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#4f72ff] hover:text-[#e8eaf0]'
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>

            {adminOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1d27] border border-[#2e3347] rounded-lg shadow-xl z-50 overflow-hidden">
                {ADMIN_SHORTCUTS.map(({ label, href, icon: Icon }, idx) => (
                  <button
                    key={href}
                    type="button"
                    onClick={() => { setAdminOpen(false); window.location.href = href; }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#c4c8d8] hover:bg-[#22263a] hover:text-[#e8eaf0] transition-colors text-left ${
                      idx === ADMIN_SHORTCUTS.length - 1 ? 'border-t border-[#2e3347] mt-1' : ''
                    }`}
                  >
                    <Icon className="h-4 w-4 text-[#4f72ff] flex-shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isEmployeeSession && (
          <button
            type="button"
            onClick={handleLock}
            disabled={locking}
            aria-label="Bloquear TPV"
            className="p-1.5 rounded-md border bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push('/tpv/turno/cerrar')}
          className="text-xs bg-[#ef444412] border border-[#ef444455] text-[#ef4444] px-3 py-1.5 rounded-md hover:bg-[#ef444420] transition-colors flex items-center gap-1.5"
        >
          <span aria-hidden="true">⏻</span>
          Cierre de Caja
        </button>
      </div>
    </header>
    </div>
  );
}
