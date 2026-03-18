'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Utensils, Tags, LogOut, Menu, X, ShoppingCart, BarChart3, Users, Megaphone, Settings, ExternalLink } from 'lucide-react';

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
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/admin/promociones', label: 'Promociones', icon: Megaphone },
  { href: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { href: '/admin/configuracion', label: 'Configuración', icon: Settings },
];

interface AdminSidebarProps {
  empresaId?: string;
}

export function AdminSidebar({ empresaId }: Readonly<AdminSidebarProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/';
  };

  return (
    <>
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-30 flex items-center justify-between px-4">
        <h1 className="text-lg font-semibold text-foreground">
          Administración
        </h1>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg hover:bg-muted transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
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
          aria-label="Cerrar menú"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 h-full w-64 bg-card border-r border-border z-40
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          {/* Desktop header */}
          <div className="hidden lg:block p-6 border-b border-border">
            <h1 className="text-lg font-semibold text-foreground">
              Administración
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {empresaId ? 'Empresa conectada' : 'Panel'}
            </p>
          </div>

          <nav className="flex-1 p-3 overflow-y-auto">
            <ul className="space-y-1">
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
                        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                        ${isActive
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }
                      `}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="p-3 border-t border-border space-y-1">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground w-full rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-4 w-4" />
              Ver tienda
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 w-full rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
