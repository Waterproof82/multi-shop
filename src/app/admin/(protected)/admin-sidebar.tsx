'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, Tags, LogOut, Menu, X, ShoppingCart,
  BarChart3, Users, Megaphone, Settings, ExternalLink, ShoppingBag,
  UtensilsCrossed, MapPin, Star, Archive, BookOpen, History,
  ClipboardList, MonitorCheck, Layers, Truck, PackageCheck, Receipt,
  FileText, TrendingUp, DollarSign, Grid2X2, CalendarDays,
  ArrowLeftRight, ChevronDown,
} from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';
import type { Language } from '@/lib/language-context';

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupColor = 'violet' | 'amber' | 'blue' | 'emerald';

interface NavItemDef {
  href: string;
  labelKey: Parameters<typeof t>[0];
  icon: React.ComponentType<{ className?: string }>;
  requiresRole?: RolAdmin[];
  requiresPromo?: boolean;
  requiresTgtg?: boolean;
  requiresRestaurant?: boolean;
  requiresDelivery?: boolean;
}

interface NavGroupDef {
  id: string;
  labelKey: Parameters<typeof t>[0];
  icon: React.ComponentType<{ className?: string }>;
  color: GroupColor;
  items: NavItemDef[];
}

type NavEntry = { type: 'item'; def: NavItemDef } | { type: 'group'; def: NavGroupDef };

interface FilterCtx {
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
  isRestaurant: boolean;
  deliveryHabilitado: boolean;
}

// ── Color config (must use complete Tailwind class strings) ───────────────────

const GROUP_COLORS: Record<GroupColor, {
  icon: string;
  iconActive: string;
  buttonHover: string;
  buttonActive: string;
  border: string;
}> = {
  violet: {
    icon:         'text-violet-400 group-hover:text-violet-300',
    iconActive:   'text-violet-300',
    buttonHover:  'hover:bg-violet-500/10 hover:text-violet-200',
    buttonActive: 'text-violet-300',
    border:       'border-violet-500/40',
  },
  amber: {
    icon:         'text-amber-400 group-hover:text-amber-300',
    iconActive:   'text-amber-300',
    buttonHover:  'hover:bg-amber-500/10 hover:text-amber-200',
    buttonActive: 'text-amber-300',
    border:       'border-amber-500/40',
  },
  blue: {
    icon:         'text-blue-400 group-hover:text-blue-300',
    iconActive:   'text-blue-300',
    buttonHover:  'hover:bg-blue-500/10 hover:text-blue-200',
    buttonActive: 'text-blue-300',
    border:       'border-blue-500/40',
  },
  emerald: {
    icon:         'text-emerald-400 group-hover:text-emerald-300',
    iconActive:   'text-emerald-300',
    buttonHover:  'hover:bg-emerald-500/10 hover:text-emerald-200',
    buttonActive: 'text-emerald-300',
    border:       'border-emerald-500/40',
  },
};

// ── Nav structure (ordered) ───────────────────────────────────────────────────

const NAV_ENTRIES: NavEntry[] = [
  { type: 'item', def: { href: '/admin', labelKey: 'sidebarDashboard', icon: LayoutDashboard } },
  {
    type: 'group',
    def: {
      id: 'catalogo',
      labelKey: 'sidebarCatalogo',
      icon: Package,
      color: 'violet',
      items: [
        { href: '/admin/categorias', labelKey: 'sidebarCategories', icon: Tags },
        { href: '/admin/productos', labelKey: 'sidebarProducts', icon: Package },
        { href: '/admin/complementos', labelKey: 'sidebarComplementos', icon: Layers, requiresRestaurant: true },
      ],
    },
  },
  { type: 'item', def: { href: '/admin/pedidos', labelKey: 'sidebarOrders', icon: ShoppingCart } },
  { type: 'item', def: { href: '/admin/clientes', labelKey: 'sidebarClients', icon: Users } },
  { type: 'item', def: { href: '/admin/mesas', labelKey: 'sidebarMesas', icon: UtensilsCrossed, requiresRestaurant: true } },
  { type: 'item', def: { href: '/admin/valoraciones', labelKey: 'adminValoraciones', icon: Star, requiresRestaurant: true } },
  { type: 'item', def: { href: '/admin/estadisticas', labelKey: 'sidebarStatistics', icon: BarChart3 } },
  { type: 'item', def: { href: '/admin/promociones', labelKey: 'sidebarPromotions', icon: Megaphone, requiresPromo: true } },
  { type: 'item', def: { href: '/admin/toogoodtogo', labelKey: 'sidebarTooGoodToGo', icon: ShoppingBag, requiresTgtg: true } },
  { type: 'item', def: { href: '/admin/delivery', labelKey: 'sidebarDelivery', icon: MapPin, requiresDelivery: true } },
  {
    type: 'group',
    def: {
      id: 'stock',
      labelKey: 'sidebarStock',
      icon: Archive,
      color: 'amber',
      items: [
        { href: '/admin/stock/ingredientes', labelKey: 'sidebarStockIngredientes', icon: Archive, requiresRestaurant: true },
        { href: '/admin/stock/recetas', labelKey: 'sidebarStockRecetas', icon: BookOpen, requiresRestaurant: true },
        { href: '/admin/stock/movimientos', labelKey: 'sidebarStockMovimientos', icon: History, requiresRestaurant: true },
        { href: '/admin/stock/inventario', labelKey: 'sidebarStockInventario', icon: ClipboardList, requiresRestaurant: true },
      ],
    },
  },
  {
    type: 'group',
    def: {
      id: 'compras',
      labelKey: 'sidebarCompras',
      icon: Truck,
      color: 'blue',
      items: [
        { href: '/admin/compras/proveedores', labelKey: 'sidebarComprasProveedores', icon: Truck },
        { href: '/admin/compras/pedidos', labelKey: 'sidebarComprasPedidos', icon: FileText },
        { href: '/admin/compras/albaranes', labelKey: 'sidebarComprasAlbaranes', icon: PackageCheck },
        { href: '/admin/compras/facturas', labelKey: 'sidebarComprasFacturas', icon: Receipt },
      ],
    },
  },
  {
    type: 'group',
    def: {
      id: 'analitica',
      labelKey: 'sidebarAnalytica',
      icon: BarChart3,
      color: 'emerald',
      items: [
        { href: '/admin/analytics/food-cost', labelKey: 'sidebarAnalyticsFoodCost', icon: TrendingUp, requiresRestaurant: true },
        { href: '/admin/analytics/rentabilidad', labelKey: 'sidebarAnalyticsRentabilidad', icon: DollarSign, requiresRestaurant: true },
        { href: '/admin/analytics/menu-engineering', labelKey: 'sidebarAnalyticsMenuEngineering', icon: Grid2X2, requiresRestaurant: true },
        { href: '/admin/analytics/ocupacion', labelKey: 'sidebarAnalyticsOcupacion', icon: CalendarDays, requiresRestaurant: true },
        { href: '/admin/analytics/comparativa', labelKey: 'sidebarAnalyticsComparativa', icon: ArrowLeftRight, requiresRestaurant: true },
      ],
    },
  },
  { type: 'item', def: { href: '/admin/audit-log', labelKey: 'sidebarAuditLog', icon: MonitorCheck, requiresRestaurant: true } },
  { type: 'item', def: { href: '/admin/configuracion', labelKey: 'sidebarSettings', icon: Settings } },
];

// ── Filtering ─────────────────────────────────────────────────────────────────

function isItemVisible(item: NavItemDef, ctx: FilterCtx): boolean {
  if (item.requiresPromo && !ctx.mostrarPromociones) return false;
  if (item.requiresTgtg && !ctx.mostrarTgtg) return false;
  if (item.requiresRestaurant && !ctx.isRestaurant) return false;
  if (item.requiresDelivery && !ctx.deliveryHabilitado) return false;
  return true;
}

function filterEntry(entry: NavEntry, ctx: FilterCtx): NavEntry | null {
  if (entry.type === 'item') {
    return isItemVisible(entry.def, ctx) ? entry : null;
  }
  const visibleItems = entry.def.items.filter((item) => isItemVisible(item, ctx));
  if (visibleItems.length === 0) return null;
  return { type: 'group', def: { ...entry.def, items: visibleItems } };
}

function computeInitialOpenGroups(currentPath: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const entry of NAV_ENTRIES) {
    if (entry.type === 'group') {
      result[entry.def.id] = entry.def.items.some((item) => currentPath.startsWith(item.href));
    }
  }
  return result;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const LINK_BASE =
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 group';
const ACTIVE_STYLE =
  'bg-gradient-to-r from-cyan-500/30 to-teal-600/30 text-white border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]';
const INACTIVE_STYLE =
  'text-slate-300 hover:bg-white/5 hover:text-white hover:border hover:border-white/10';

// ── NavFlatItem ───────────────────────────────────────────────────────────────

interface NavFlatItemProps {
  item: NavItemDef;
  pathname: string;
  language: Language;
  onClose: () => void;
}

function NavFlatItem({ item, pathname, language, onClose }: Readonly<NavFlatItemProps>) {
  const isActive = pathname === item.href;
  const Icon = item.icon;
  return (
    <li style={{ listStyle: 'none' }}>
      <Link
        href={item.href}
        onClick={onClose}
        aria-current={isActive ? 'page' : undefined}
        className={`${LINK_BASE} ${isActive ? ACTIVE_STYLE : INACTIVE_STYLE}`}
      >
        <Icon
          className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
            isActive
              ? 'scale-110 text-cyan-300'
              : 'text-slate-400 group-hover:scale-105 group-hover:text-slate-200'
          }`}
        />
        {t(item.labelKey, language)}
      </Link>
    </li>
  );
}

// ── NavSubItem ────────────────────────────────────────────────────────────────

interface NavSubItemProps {
  item: NavItemDef;
  pathname: string;
  language: Language;
  onClose: () => void;
}

function NavSubItem({ item, pathname, language, onClose }: Readonly<NavSubItemProps>) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <li style={{ listStyle: 'none' }}>
      <Link
        href={item.href}
        onClick={onClose}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 group ${
          isActive ? ACTIVE_STYLE : INACTIVE_STYLE
        }`}
      >
        <Icon
          className={`h-3.5 w-3.5 flex-shrink-0 ${
            isActive ? 'text-cyan-300' : 'text-slate-400 group-hover:text-slate-200'
          }`}
        />
        {t(item.labelKey, language)}
      </Link>
    </li>
  );
}

// ── NavGroupAccordion ─────────────────────────────────────────────────────────

interface NavGroupAccordionProps {
  group: NavGroupDef;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  language: Language;
  onClose: () => void;
}

function resolveButtonClass(hasActiveChild: boolean, colorCfg: typeof GROUP_COLORS[GroupColor]): string {
  const base = 'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 group';
  if (hasActiveChild) return `${base} ${colorCfg.buttonActive}`;
  return `${base} text-slate-300 ${colorCfg.buttonHover}`;
}

function NavGroupAccordion({
  group,
  isOpen,
  onToggle,
  pathname,
  language,
  onClose,
}: Readonly<NavGroupAccordionProps>) {
  const GroupIcon = group.icon;
  const colorCfg = GROUP_COLORS[group.color];
  const hasActiveChild = group.items.some((item) => pathname.startsWith(item.href));

  return (
    <li style={{ listStyle: 'none' }}>
      <button
        type="button"
        onClick={onToggle}
        className={resolveButtonClass(hasActiveChild, colorCfg)}
      >
        <GroupIcon
          className={`h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
            hasActiveChild ? colorCfg.iconActive : colorCfg.icon
          }`}
        />
        <span className="flex-1 text-left">{t(group.labelKey, language)}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-slate-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <ul className={`mt-0.5 ml-4 pl-3 border-l-2 ${colorCfg.border} space-y-0.5`}>
          {group.items.map((item) => (
            <NavSubItem
              key={item.href}
              item={item}
              pathname={pathname}
              language={language}
              onClose={onClose}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── AdminSidebar ──────────────────────────────────────────────────────────────

interface AdminSidebarProps {
  empresaId?: string;
}

export function AdminSidebar({ empresaId: _empresaId }: Readonly<AdminSidebarProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    computeInitialOpenGroups(pathname)
  );
  const {
    empresaLogo,
    empresaTipo,
    mostrarPromociones,
    mostrarTgtg,
    mesasHabilitadas,
    deliveryHabilitado,
  } = useAdmin();
  const { language } = useLanguage();

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const entry of NAV_ENTRIES) {
        if (entry.type !== 'group') continue;
        if (entry.def.items.some((item) => pathname.startsWith(item.href))) {
          next[entry.def.id] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  const filterCtx: FilterCtx = {
    mostrarPromociones,
    mostrarTgtg,
    isRestaurant: empresaTipo === 'restaurante' && mesasHabilitadas,
    deliveryHabilitado,
  };

  const visibleEntries = NAV_ENTRIES
    .map((entry) => filterEntry(entry, filterCtx))
    .filter((entry): entry is NavEntry => entry !== null);

  const closeMenu = () => setIsOpen(false);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const handleLogout = async () => {
    await fetchWithCsrf('/api/admin/logout', { method: 'POST' });
    globalThis.location.href = '/';
  };

  return (
    <>
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-white/10 z-30 flex items-center justify-between px-6 backdrop-blur-xl">
        {empresaLogo ? (
          <div className="relative w-10 h-10">
            <Image
              src={empresaLogo}
              alt={t('companyLogo', language)}
              fill
              className="object-contain"
              sizes="40px"
            />
          </div>
        ) : (
          <h1 className="text-lg font-bold text-white">{t('administration', language)}</h1>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          aria-label={isOpen ? t('closeMenu', language) : t('openMenu', language)}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="h-5 w-5 text-white" /> : <Menu className="h-5 w-5 text-white" />}
        </button>
      </header>

      {/* Overlay mobile */}
      {isOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          aria-label={t('closeMenu', language)}
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 h-full w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900
          border-r border-white/10 z-40 backdrop-blur-xl
          transform transition-transform duration-200 ease-in-out motion-reduce:transition-none
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-full flex flex-col">
          {/* Desktop logo */}
          <div className="hidden lg:block p-6 border-b border-white/10 text-center">
            {empresaLogo ? (
              <div className="relative w-20 h-20 mx-auto mb-4">
                <Image
                  src={empresaLogo}
                  alt={t('companyLogo', language)}
                  fill
                  className="object-contain"
                  sizes="80px"
                />
              </div>
            ) : (
              <h1 className="text-xl font-bold text-white text-center mb-2">
                {t('administration', language)}
              </h1>
            )}
            <p className="text-xs text-slate-400 text-center leading-tight">
              {t('companyConnected', language)}
            </p>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 overflow-y-auto">
            <ul className="space-y-0.5">
              {visibleEntries.map((entry) => {
                if (entry.type === 'item') {
                  return (
                    <NavFlatItem
                      key={entry.def.href}
                      item={entry.def}
                      pathname={pathname}
                      language={language}
                      onClose={closeMenu}
                    />
                  );
                }
                return (
                  <NavGroupAccordion
                    key={entry.def.id}
                    group={entry.def}
                    isOpen={openGroups[entry.def.id] ?? false}
                    onToggle={() => toggleGroup(entry.def.id)}
                    pathname={pathname}
                    language={language}
                    onClose={closeMenu}
                  />
                );
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 space-y-1">
            {filterCtx.isRestaurant && (
              <a
                href="/tpv/mostrador"
                className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm text-slate-300 hover:bg-white/5 hover:text-white w-full rounded-lg transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <MonitorCheck className="h-4 w-4 flex-shrink-0" />
                Ir al TPV
              </a>
            )}
            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm text-slate-300 hover:bg-white/5 hover:text-white w-full rounded-lg transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
              {t('viewStore', language)}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm text-rose-400 hover:bg-rose-500/10 w-full rounded-lg transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {t('logout', language)}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
