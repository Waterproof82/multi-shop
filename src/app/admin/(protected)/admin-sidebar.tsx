'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Utensils, Tags, LogOut, Menu, X, Bell, ShoppingCart, BarChart3 } from 'lucide-react';
// Removed unused import 'useTheme'

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/categorias', label: 'Categorías', icon: Tags },
  { href: '/admin/productos', label: 'Productos', icon: Utensils },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { href: '/admin/notificaciones', label: 'Notificaciones', icon: Bell },
];

interface AdminSidebarProps {
  session: any;
}

export function AdminSidebar({ session }: Readonly<AdminSidebarProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Mobile header - solo visible en mobile */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 shadow-sm z-30 flex items-center justify-between px-4">
        <h1 className="text-lg font-serif font-bold text-primary dark:text-white">
          Mermelada Admin
        </h1>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {isOpen ? <X className="h-6 w-6 dark:text-white" /> : <Menu className="h-6 w-6 dark:text-white" />}
        </button>
      </header>

      {/* Overlay para mobile */}
      {isOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          aria-label="Cerrar menú"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-lg z-40
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          {/* Desktop logo */}
          <div className="hidden lg:block p-6 border-b dark:border-gray-700">
            <h1 className="text-xl font-serif font-bold text-primary dark:text-white">
              Mermelada Admin
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {session?.empresaId ? 'Empresa conectada' : 'Panel'}
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
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                        ${isActive 
                          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground font-medium' 
                          : 'text-gray-700 dark:text-gray-200 hover:bg-primary/10 hover:text-primary dark:hover:bg-gray-700'
                        }
                      `}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="p-4 border-t dark:border-gray-700">
            <form action="/api/admin/logout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full rounded-lg transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Cerrar Sesión
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
