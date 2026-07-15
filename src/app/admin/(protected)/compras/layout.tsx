'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const TABS = [
  { href: '/admin/compras/proveedores', labelKey: 'comprasProveedores' as const },
  { href: '/admin/compras/pedidos', labelKey: 'comprasPedidos' as const },
  { href: '/admin/compras/albaranes', labelKey: 'comprasAlbaranes' as const },
  { href: '/admin/compras/facturas', labelKey: 'comprasFacturas' as const },
];

export default function ComprasLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { language } = useLanguage();

  return (
    <div className="pt-16 lg:pt-0 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <nav className="px-6 pt-6 pb-0 border-b border-white/10">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                  isActive
                    ? 'bg-white/10 text-white border border-white/20 border-b-transparent'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {t(tab.labelKey, language)}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}
