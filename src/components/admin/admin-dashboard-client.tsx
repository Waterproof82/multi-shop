'use client';

import Link from 'next/link';
import { ShoppingBag, Package, ArrowRight, Clock } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import { PEDIDO_ESTADO_LABELS, PEDIDO_ESTADO_COLORS } from '@/core/domain/constants/pedido';
import type { PedidoEstado } from '@/core/domain/constants/pedido';
import { formatPrice } from '@/lib/format-price';

interface PedidoItem {
  id: string;
  numero_pedido: number;
  clientes: { nombre: string | null; telefono: string | null } | null;
  total: number;
  estado: string;
  created_at: string;
}

interface StatsData {
  pedidosHoy: number;
  totalMes: number;
}

interface AdminDashboardClientProps {
  readonly empresaNombre: string;
  readonly menu: MenuCategoryVM[];
  readonly pedidos: PedidoItem[];
  readonly stats: StatsData | null;
  readonly menuError?: string;
}

export function AdminDashboardClient({ empresaNombre, menu, pedidos, stats, menuError }: AdminDashboardClientProps) {
  const { language } = useLanguage();

  const totalProductos = menu.reduce((sum, cat) => sum + cat.items.length, 0);
  const productosEspeciales = menu.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.highlight).length,
    0
  );
  
  const recentOrders = [...pedidos]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (menuError) {
    return (
      <div className="pt-16 lg:pt-0 px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t("dashboard", language)}
        </h1>
        <p className="text-muted-foreground mb-6">
          {t("dashboard", language)}: <strong>{empresaNombre}</strong>
        </p>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive">{menuError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{t("dashboard", language)}</h1>
            <p className="text-muted-foreground text-sm mt-1">{empresaNombre}</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold text-foreground tabular-nums">{stats?.pedidosHoy || 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("pedidosHoy", language)}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold text-foreground tabular-nums">{formatPrice(stats?.totalMes || 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("ventasDelMes", language)}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold text-foreground tabular-nums">{totalProductos}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("products", language)}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-3xl font-bold text-foreground tabular-nums">{productosEspeciales}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("destacados", language)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link 
          href="/admin/productos" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Package className="w-4 h-4" />
          {t("newProduct", language)}
        </Link>
        <Link 
          href="/admin/pedidos" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm font-medium"
        >
          <ShoppingBag className="w-4 h-4" />
          {t("viewOrders", language)}
        </Link>
      </div>

      {/* Recent Orders */}
      <div className="bg-card rounded-lg border border-border overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {t("recentOrders", language)}
          </h2>
          <Link href="/admin/pedidos" className="text-sm text-primary hover:underline flex items-center gap-1">
            {t("viewAll", language)} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        
        {recentOrders.length > 0 ? (
          <div className="divide-y divide-border">
            {recentOrders.map((pedido) => (
              <div key={pedido.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">#{pedido.numero_pedido}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      PEDIDO_ESTADO_COLORS[pedido.estado as PedidoEstado] || 'bg-muted text-muted-foreground'
                    }`}>
                      {PEDIDO_ESTADO_LABELS[pedido.estado as keyof typeof PEDIDO_ESTADO_LABELS] || pedido.estado}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {pedido.clientes?.nombre || t("customer", language)} • {pedido.clientes?.telefono || t("noPhone", language)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{formatPrice(pedido.total)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(pedido.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t("noOrdersYet", language)}</p>
          </div>
        )}
      </div>

      {/* Menu Preview */}
      <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">{t("menuPreview", language)}</h2>
        <div className="space-y-3">
          {menu.slice(0, 5).map((categoria) => (
            <div key={categoria.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <h3 className="font-medium text-foreground">{categoria.label}</h3>
                <p className="text-sm text-muted-foreground">{categoria.items.length} {t("products", language)}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
          {menu.length > 5 && (
            <Link href="/admin/categorias" className="block text-center text-sm text-primary hover:underline pt-2">
              {t("viewAllCategories", language)} ({menu.length})
            </Link>
          )}
          {menu.length === 0 && (
            <p className="text-muted-foreground text-center py-4">
              {t("noCategoriesConfigured", language)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
