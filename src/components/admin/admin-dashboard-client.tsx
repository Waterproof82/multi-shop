'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, Package, ArrowRight, Clock, Send, Tag } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import { PEDIDO_ESTADO_COLORS } from '@/core/domain/constants/pedido';
import type { PedidoEstado } from '@/core/domain/constants/pedido';
import { formatPrice } from '@/lib/format-price';
import { formatDate } from '@/lib/format-date';
import { Button } from '@/components/ui/button';

export interface DashboardPedido {
  id: string;
  numero_pedido: number;
  clientes: { nombre: string | null; telefono: string | null } | null;
  total: number;
  estado: string;
  created_at: string;
}

export interface DashboardStats {
  pedidosHoy: number;
  totalMes: number;
}

export interface DashboardPromoSummary {
  total: number;
  lastDate: string | null;
  totalEmails: number;
}

export interface DashboardTgtgSummary {
  activeCampaigns: number;
  sentCampaigns: number;
  claimedCoupons: number;
}

interface AdminDashboardClientProps {
  readonly empresaNombre: string;
  readonly menu: MenuCategoryVM[];
  readonly pedidos: DashboardPedido[];
  readonly stats: DashboardStats | null;
  readonly menuError?: string;
  readonly promoSummary: DashboardPromoSummary;
  readonly tgtgSummary: DashboardTgtgSummary;
  readonly mostrarPromociones: boolean;
  readonly mostrarTgtg: boolean;
}

export function AdminDashboardClient({ empresaNombre, menu, pedidos, stats, menuError, promoSummary, tgtgSummary, mostrarPromociones, mostrarTgtg }: AdminDashboardClientProps) {
  const { language } = useLanguage();
  const shouldReduceMotion = useReducedMotion() ?? false;

  const totalProductos = menu.reduce((sum, cat) => sum + cat.items.length, 0);
  const productosEspeciales = menu.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.highlight).length,
    0
  );
  
  const recentOrders = [...pedidos]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  if (menuError) {
    return (
      <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6" suppressHydrationWarning>
        <div className="bg-primary rounded-lg p-4 sm:p-6" suppressHydrationWarning>
          <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("dashboard", language)}</h1>
          <p className="text-primary-foreground/80 text-sm mt-1">{empresaNombre}</p>
        </div>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive">{menuError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6" suppressHydrationWarning>
      {/* Header con stats */}
      <div className="bg-primary rounded-lg p-4 sm:p-6" suppressHydrationWarning>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" suppressHydrationWarning>
          <div suppressHydrationWarning>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("dashboard", language)}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{empresaNombre}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" suppressHydrationWarning>
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center min-h-[72px] flex flex-col justify-center group hover:bg-primary-foreground/30 transition-[background-color,transform] duration-150 hover:scale-[1.02] motion-reduce:hover:scale-100 hover:shadow-elegant" suppressHydrationWarning>
              <ShoppingBag className="w-5 h-5 text-primary-foreground mx-auto mb-2 group-hover:scale-110 motion-reduce:group-hover:scale-100 transition-transform duration-300" />
              <span className="text-xl font-semibold text-primary-foreground">{stats?.pedidosHoy || 0}</span>
              <p className="text-primary-foreground/80 text-xs leading-tight mt-1">{t("pedidosHoy", language)}</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center min-h-[72px] flex flex-col justify-center group hover:bg-primary-foreground/30 transition-[background-color,transform] duration-150 hover:scale-[1.02] motion-reduce:hover:scale-100 hover:shadow-elegant">
              <span suppressHydrationWarning className="text-xl font-semibold text-primary-foreground">{formatPrice(stats?.totalMes || 0, 'EUR', language)}</span>
              <p className="text-primary-foreground/80 text-xs leading-tight mt-1">{t("ventasDelMes", language)}</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center min-h-[72px] flex flex-col justify-center group hover:bg-primary-foreground/30 transition-[background-color,transform] duration-150 hover:scale-[1.02] motion-reduce:hover:scale-100 hover:shadow-elegant">
              <Package className="w-5 h-5 text-primary-foreground mx-auto mb-2 group-hover:scale-110 motion-reduce:group-hover:scale-100 transition-transform duration-300" />
              <span className="text-xl font-semibold text-primary-foreground">{totalProductos}</span>
              <p className="text-primary-foreground/80 text-xs leading-tight mt-1">{t("products", language)}</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-4 py-3 text-center min-h-[72px] flex flex-col justify-center group hover:bg-primary-foreground/30 transition-[background-color,transform] duration-150 hover:scale-[1.02] motion-reduce:hover:scale-100 hover:shadow-elegant">
              <span className="text-xl font-semibold text-primary-foreground">{productosEspeciales}</span>
              <p className="text-primary-foreground/80 text-xs leading-tight mt-1">{t("destacados", language)}</p>
            </div>
          </div>
        </div>

        {/* Marketing row */}
        {(mostrarPromociones || mostrarTgtg) && (
        <div className="mt-4 pt-4 border-t border-primary-foreground/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mostrarPromociones && <Link
            href="/admin/promociones"
            className="bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-lg px-4 py-3 flex items-center gap-4 transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary min-h-[44px]"
          >
            <div className="w-9 h-9 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 motion-reduce:group-hover:scale-100 transition-transform duration-300">
              <Send className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wide">{t("sidebarPromotions", language)}</p>
                {promoSummary.lastDate && (
                  <span suppressHydrationWarning className="text-xs text-primary-foreground/50 whitespace-nowrap">
                    {new Date(promoSummary.lastDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-primary-foreground leading-tight">
                {promoSummary.total} {t("promotionsSent", language)}
              </p>
              <p suppressHydrationWarning className="text-xs text-primary-foreground/60 mt-0.5">
                {promoSummary.totalEmails.toLocaleString('es-ES')} {t("totalEmails", language)}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary-foreground/40 flex-shrink-0 group-hover:text-primary-foreground/70 transition-colors" />
          </Link>}

          {mostrarTgtg && <Link
            href="/admin/toogoodtogo"
            className="bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded-lg px-4 py-3 flex items-center gap-4 transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary min-h-[44px]"
          >
            <div className="w-9 h-9 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 motion-reduce:group-hover:scale-100 transition-transform duration-300">
              <Tag className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wide">{t("sidebarTooGoodToGo", language)}</p>
              <p className="text-base font-semibold text-primary-foreground leading-tight">
                {tgtgSummary.activeCampaigns > 0
                  ? `${tgtgSummary.activeCampaigns} ${tgtgSummary.activeCampaigns > 1 ? t("activeCampaigns", language) : t("activeCampaign", language)}`
                  : `${tgtgSummary.sentCampaigns} ${tgtgSummary.sentCampaigns !== 1 ? t("campaigns", language) : t("campaign", language)}`
                }
              </p>
              <p className="text-xs text-primary-foreground/60 mt-0.5">
                {tgtgSummary.claimedCoupons} {t("redeemedSent", language)}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary-foreground/40 flex-shrink-0 group-hover:text-primary-foreground/70 transition-colors" />
          </Link>}
        </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        <Button asChild>
          <Link href="/admin/productos">
            <Package className="w-5 h-5" />
            {t("newProduct", language)}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin/pedidos">
            <ShoppingBag className="w-5 h-5" />
            {t("viewOrders", language)}
          </Link>
        </Button>
      </div>

      {/* Recent Orders */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            {t("recentOrders", language)}
          </h2>
          <Link href="/admin/pedidos" className="text-sm text-primary hover:text-primary/80 flex items-center gap-2 font-medium transition-colors">
            {t("viewAll", language)} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        {recentOrders.length > 0 ? (
          <div className="divide-y divide-border">
            {recentOrders.map((pedido) => (
              <div key={pedido.id} className="p-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-foreground">#{pedido.numero_pedido}</span>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                      PEDIDO_ESTADO_COLORS[pedido.estado as PedidoEstado] || 'bg-muted text-muted-foreground'
                    }`}>
                      {(() => {
                        const key = {
                          pendiente: 'statusPendiente',
                          aceptado: 'statusAceptado',
                          preparando: 'statusPreparando',
                          enviado: 'statusEnviado',
                          entregado: 'statusEntregado',
                          cancelado: 'statusCancelado',
                        }[pedido.estado] as Parameters<typeof t>[0] | undefined;
                        return key ? t(key, language) : pedido.estado;
                      })()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pedido.clientes?.nombre || t("customer", language)} • {pedido.clientes?.telefono || t("noPhone", language)}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p suppressHydrationWarning className="font-semibold text-foreground text-lg">{formatPrice(pedido.total, 'EUR', language)}</p>
                  <p suppressHydrationWarning className="text-xs text-muted-foreground mt-1">{formatDate(pedido.created_at, {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  }, language)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            <motion.div
              initial={shouldReduceMotion ? {} : { scale: 0.8, opacity: 0 }}
              animate={shouldReduceMotion ? {} : { scale: 1, opacity: 1 }}
              transition={shouldReduceMotion ? {} : { duration: 0.5, delay: 0.2 }}
            >
              <ShoppingBag className="w-16 h-16 mx-auto mb-6 opacity-50" />
              <h3 className="text-lg font-semibold mb-2 text-foreground">{t("noOrdersYet", language)}</h3>
              <p className="text-sm leading-relaxed mb-4">{t("ordersArriveHere", language)}</p>
              <p className="text-xs text-muted-foreground/70 italic">
                {t("firstOrder", language)}
              </p>
            </motion.div>
          </div>
        )}
      </div>

      {/* Menu Preview */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-6 text-foreground">{t("menuPreview", language)}</h2>
        <div className="space-y-4">
          {menu.slice(0, 5).map((categoria) => (
            <div key={categoria.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
              <div>
                <h3 className="font-medium text-foreground mb-1">{categoria.label}</h3>
                <p className="text-sm text-muted-foreground">{categoria.items.length} {t("products", language)}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>
          ))}
          {menu.length > 5 && (
            <Link href="/admin/categorias" className="block text-center text-sm text-primary hover:text-primary/80 font-medium pt-4 transition-colors">
              {t("viewAllCategories", language)} ({menu.length})
            </Link>
          )}
          {menu.length === 0 && (
            <p className="text-muted-foreground text-center py-8 text-sm">
              {t("noCategoriesConfigured", language)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
