'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Utensils, Tags, LogOut, Menu, X } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/categorias', label: 'Categorías', icon: Tags },
  { href: '/admin/productos', label: 'Productos', icon: Utensils },
];

interface AdminSidebarProps {
  session: any;
}

export function AdminSidebar({ session }: AdminSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Mobile header - solo visible en mobile */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white shadow-sm z-30 flex items-center justify-between px-4">
        <h1 className="text-lg font-serif font-bold text-primary">
          Mermelada Admin
        </h1>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Overlay para mobile */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 h-full w-64 bg-white shadow-lg z-40
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          {/* Desktop logo */}
          <div className="hidden lg:block p-6 border-b">
            <h1 className="text-xl font-serif font-bold text-primary">
              Mermelada Admin
            </h1>
            <p className="text-xs text-gray-500 mt-1">
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
                          ? 'bg-primary/10 text-primary font-medium' 
                          : 'text-gray-700 hover:bg-primary/10 hover:text-primary'
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

          <div className="p-4 border-t">
            <form action="/api/admin/logout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 w-full rounded-lg transition-colors"
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
