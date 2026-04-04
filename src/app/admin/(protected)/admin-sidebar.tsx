'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, Tags, LogOut, Menu, X, ShoppingCart, BarChart3, Users, Megaphone, Settings, ExternalLink, ShoppingBag } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface NavItem {
  href: string;
  labelKey: Parameters<typeof t>[0];
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_NAV_ITEMS: (NavItem & { requiresPromo?: boolean; requiresTgtg?: boolean })[] = [
  { href: '/admin', labelKey: 'sidebarDashboard', icon: LayoutDashboard },
  { href: '/admin/categorias', labelKey: 'sidebarCategories', icon: Tags },
  { href: '/admin/productos', labelKey: 'sidebarProducts', icon: Package },
  { href: '/admin/pedidos', labelKey: 'sidebarOrders', icon: ShoppingCart },
  { href: '/admin/clientes', labelKey: 'sidebarClients', icon: Users },
  { href: '/admin/promociones', labelKey: 'sidebarPromotions', icon: Megaphone, requiresPromo: true },
  { href: '/admin/toogoodtogo', labelKey: 'sidebarTooGoodToGo', icon: ShoppingBag, requiresTgtg: true },
  { href: '/admin/estadisticas', labelKey: 'sidebarStatistics', icon: BarChart3 },
  { href: '/admin/configuracion', labelKey: 'sidebarSettings', icon: Settings },
];

interface AdminSidebarProps {
  empresaId?: string;
}

export function AdminSidebar({ empresaId }: Readonly<AdminSidebarProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { empresaLogo, mostrarPromociones, mostrarTgtg } = useAdmin();
  const { language } = useLanguage();

  const navItems = BASE_NAV_ITEMS.filter(
    (item) =>
      (!item.requiresPromo || mostrarPromociones) &&
      (!item.requiresTgtg || mostrarTgtg)
  );

  const closeMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    await fetchWithCsrf('/api/admin/logout', { method: 'POST' });
    globalThis.location.href = '/';
  };

  return (
    <>
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-30 flex items-center justify-between px-6">
        {empresaLogo ? (
          <div className="relative w-10 h-10">
            <Image
              src={empresaLogo}
              alt={t("companyLogo", language)}
              fill
              className="object-contain"
              sizes="40px"
            />
          </div>
        ) : (
          <h1 className="text-lg font-semibold text-foreground">
            {t("administration", language)}
          </h1>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={isOpen ? t("closeMenu", language) : t("openMenu", language)}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-foreground" />}
        </button>
      </header>

      {/* Overlay para mobile */}
      {isOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 bg-overlay z-40"
          aria-label={t("closeMenu", language)}
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 h-full w-64 bg-card border-r border-border z-40
        transform transition-transform duration-200 ease-in-out motion-reduce:transition-none
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          {/* Desktop header */}
          <div className="hidden lg:block p-6 border-b border-border">
            {empresaLogo ? (
              <div className="relative w-20 h-20 mx-auto mb-4">
                <Image
                  src={empresaLogo}
                  alt={t("companyLogo", language)}
                  fill
                  className="object-contain"
                  sizes="80px"
                />
              </div>
            ) : (
              <h1 className="text-lg font-semibold text-foreground text-center mb-2">
                {t("administration", language)}
              </h1>
            )}
            <p className="text-xs text-muted-foreground text-center leading-tight">
              {t("companyConnected", language)}
            </p>
          </div>

          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      aria-current={isActive ? 'page' : undefined}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-[background-color,color,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group
                        ${isActive
                          ? 'bg-primary text-primary-foreground shadow-sm scale-[1.02]'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-[1.01] hover:shadow-sm'
                        }
                      `}
                    >
                      <Icon className={`h-5 w-5 flex-shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                      {t(item.labelKey, language)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="p-4 border-t border-border space-y-2">
            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-muted-foreground hover:bg-muted hover:text-foreground w-full rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-5 w-5 flex-shrink-0" />
              {t("viewStore", language)}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-destructive hover:bg-destructive/10 w-full rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {t("logout", language)}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
