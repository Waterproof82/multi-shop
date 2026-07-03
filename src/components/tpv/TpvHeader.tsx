'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

const NAV_ITEMS = [
  { label: 'Mostrador', href: '/tpv/mostrador', activePrefix: '/tpv/mostrador' },
  { label: 'Mesas',     href: '/tpv/mesas?seleccionar=1', activePrefix: '/tpv/mesas' },
  { label: 'Historial', href: '/tpv/historial', activePrefix: '/tpv/historial' },
] as const;

export function TpvHeader({ empresaNombre }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  return (
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
        <TpvClock />
        <button
          type="button"
          onClick={() => router.push('/tpv/turno/cerrar')}
          className="text-xs bg-[#22263a] border border-[#2e3347] px-3 py-1.5 rounded-md hover:border-[#4f72ff] transition-colors"
        >
          Cierre de Caja
        </button>
      </div>
    </header>
  );
}
