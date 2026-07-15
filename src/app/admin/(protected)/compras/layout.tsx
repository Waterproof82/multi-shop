'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { ComprasProvider } from './compras-context';

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
    <div className="pt-16 lg:pt-0 min-h-screen">
      <nav className="px-6 pt-6 pb-0 border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/30 border-b-transparent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {t(tab.labelKey, language)}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="px-6 py-8">
        <ComprasProvider>{children}</ComprasProvider>
      </div>
    </div>
  );
}
