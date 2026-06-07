'use client';

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
      <div className="pt-16 lg:pt-0 px-6 py-8 space-y-6 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" suppressHydrationWarning>
        <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl" suppressHydrationWarning>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{t("dashboard", language)}</h1>
          <p className="text-slate-300 text-lg mt-2">{empresaNombre}</p>
        </div>
        <div className="backdrop-blur-xl bg-red-500/10 border border-red-400/30 rounded-2xl p-6">
          <p className="text-red-300 font-medium">{menuError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" suppressHydrationWarning>
      {/* Header con stats - Glassmorphic design */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl" suppressHydrationWarning>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6" suppressHydrationWarning>
          <div suppressHydrationWarning className="space-y-1">
<h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{t("dashboard", language)}</h1>
            <p className="text-slate-300 text-lg">{empresaNombre}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" suppressHydrationWarning>
            <section 
              className="backdrop-blur-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/20 border border-cyan-400/30 rounded-xl px-4 py-4 text-center min-h-[88px] flex flex-col justify-center group hover:from-cyan-500/30 hover:to-cyan-700/30 hover:border-cyan-400/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]" 
              suppressHydrationWarning
              aria-label={`${t("pedidosHoy", language)}: ${stats?.pedidosHoy || 0}`}
            >
              <ShoppingBag className="w-6 h-6 text-cyan-300 mx-auto mb-3 group-hover:scale-125 motion-reduce:group-hover:scale-100 transition-transform duration-300" />
              <span className="text-2xl font-bold text-white" aria-live="polite">{stats?.pedidosHoy || 0}</span>
              <p className="text-cyan-200 text-xs leading-tight mt-2 uppercase tracking-wider font-medium">{t("pedidosHoy", language)}</p>
            </section>
            <section 
              className="backdrop-blur-xl bg-gradient-to-br from-amber-500/20 to-yellow-700/20 border border-amber-400/30 rounded-xl px-4 py-4 text-center min-h-[88px] flex flex-col justify-center group hover:from-amber-500/30 hover:to-yellow-700/30 hover:border-amber-400/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(251,146,60,0.3)]"
              aria-label={`${t("ventasDelMes", language)}: ${formatPrice(stats?.totalMes || 0, 'EUR', language)}`}
            >
              <span suppressHydrationWarning className="text-2xl font-bold text-white" aria-live="polite">{formatPrice(stats?.totalMes || 0, 'EUR', language)}</span>
              <p className="text-amber-200 text-xs leading-tight mt-2 uppercase tracking-wider font-medium">{t("ventasDelMes", language)}</p>
            </section>
            <section 
              className="backdrop-blur-xl bg-gradient-to-br from-teal-500/20 to-green-700/20 border border-teal-400/30 rounded-xl px-4 py-4 text-center min-h-[88px] flex flex-col justify-center group hover:from-teal-500/30 hover:to-green-700/30 hover:border-teal-400/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(20,184,166,0.3)]"
              aria-label={`${t("products", language)}: ${totalProductos}`}
            >
              <Package className="w-6 h-6 text-teal-300 mx-auto mb-3 group-hover:scale-125 motion-reduce:group-hover:scale-100 transition-transform duration-300" />
              <span className="text-2xl font-bold text-white" aria-live="polite">{totalProductos}</span>
              <p className="text-teal-200 text-xs leading-tight mt-2 uppercase tracking-wider font-medium">{t("products", language)}</p>
            </section>
            <section 
              className="backdrop-blur-xl bg-gradient-to-br from-purple-500/20 to-pink-700/20 border border-purple-400/30 rounded-xl px-4 py-4 text-center min-h-[88px] flex flex-col justify-center group hover:from-purple-500/30 hover:to-pink-700/30 hover:border-purple-400/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
              aria-label={`${t("destacados", language)}: ${productosEspeciales}`}
            >
              <span className="text-2xl font-bold text-white" aria-live="polite">{productosEspeciales}</span>
              <p className="text-purple-200 text-xs leading-tight mt-2 uppercase tracking-wider font-medium">{t("destacados", language)}</p>
            </section>
          </div>
        </div>

        {/* Marketing row */}
        {(mostrarPromociones || mostrarTgtg) && (
        <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {mostrarPromociones && <Link
            href="/admin/promociones"
            className="backdrop-blur-xl bg-gradient-to-br from-rose-500/20 to-orange-700/20 border border-rose-400/30 hover:border-rose-400/50 rounded-xl px-5 py-4 flex items-center gap-4 transition-all duration-300 group outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 min-h-[80px] hover:shadow-[0_0_20px_rgba(251,113,133,0.2)]"
          >
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-rose-400/30 to-orange-500/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 motion-reduce:group-hover:scale-100 transition-transform duration-300">
              <Send className="w-5 h-5 text-rose-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-rose-200 uppercase tracking-wider">{t("sidebarPromotions", language)}</p>
                {promoSummary.lastDate && (
                  <span suppressHydrationWarning className="text-xs text-rose-300/70 whitespace-nowrap text-right">
                    {new Date(promoSummary.lastDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
              <p className="text-lg font-bold text-white leading-tight">
                {promoSummary.total} {t("promotionsSent", language)}
              </p>
              <p suppressHydrationWarning className="text-xs text-rose-200/70 mt-1">
                {promoSummary.totalEmails.toLocaleString('es-ES')} {t("totalEmails", language)}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-rose-300/50 flex-shrink-0 group-hover:text-rose-300 transition-colors" />
          </Link>}

          {mostrarTgtg && <Link
            href="/admin/toogoodtogo"
            className="backdrop-blur-xl bg-gradient-to-br from-cyan-500/20 to-blue-700/20 border border-cyan-400/30 hover:border-cyan-400/50 rounded-xl px-5 py-4 flex items-center gap-4 transition-all duration-300 group outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 min-h-[80px] hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          >
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-400/30 to-blue-500/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 motion-reduce:group-hover:scale-100 transition-transform duration-300">
              <Tag className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-cyan-200 uppercase tracking-wider">{t("sidebarTooGoodToGo", language)}</p>
              <p className="text-lg font-bold text-white leading-tight">
                {(() => {
                  if (tgtgSummary.activeCampaigns > 0) {
                    const plural = tgtgSummary.activeCampaigns > 1 ? t("activeCampaigns", language) : t("activeCampaign", language);
                    return `${tgtgSummary.activeCampaigns} ${plural}`;
                  }
                  const plural = tgtgSummary.sentCampaigns === 1 ? t("campaign", language) : t("campaigns", language);
                  return `${tgtgSummary.sentCampaigns} ${plural}`;
                })()}
              </p>
              <p className="text-xs text-cyan-200/70 mt-1">
                {tgtgSummary.claimedCoupons} {t("redeemedSent", language)}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-cyan-300/50 flex-shrink-0 group-hover:text-cyan-300 transition-colors" />
          </Link>}
        </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        <Button asChild className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold px-6 py-3 rounded-lg shadow-lg hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all duration-300 border-0">
          <Link href="/admin/productos">
            <Package className="w-5 h-5" />
            {t("newProduct", language)}
          </Link>
        </Button>
        <Button variant="outline" asChild className="backdrop-blur-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 font-bold px-6 py-3 rounded-lg transition-all duration-300">
          <Link href="/admin/pedidos">
            <ShoppingBag className="w-5 h-5" />
            {t("viewOrders", language)}
          </Link>
        </Button>
      </div>

      {/* Recent Orders */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-400/30 to-emerald-600/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-emerald-300" />
            </div>
            {t("recentOrders", language)}
          </h2>
          <Link href="/admin/pedidos" className="text-sm text-cyan-300 hover:text-cyan-200 flex items-center gap-2 font-bold transition-colors">
            {t("viewAll", language)} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        {recentOrders.length > 0 ? (
          <div className="divide-y divide-white/10">
            {recentOrders.map((pedido) => (
              <div key={pedido.id} className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="font-bold text-white text-lg">#{pedido.numero_pedido}</span>
                    <span className={`text-xs px-4 py-2 rounded-full font-bold ${
                      PEDIDO_ESTADO_COLORS[pedido.estado as PedidoEstado] || 'bg-slate-500/30 text-slate-300'
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
                  <p className="text-slate-300 text-base">
                    {pedido.clientes?.nombre || t("customer", language)} • {pedido.clientes?.telefono || t("noPhone", language)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p suppressHydrationWarning className="font-bold text-white text-xl">{formatPrice(pedido.total, 'EUR', language)}</p>
                  <p suppressHydrationWarning className="text-slate-400 text-xs mt-2">{formatDate(pedido.created_at, {
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
          <div className="p-12 sm:p-16 text-center">
            <motion.div
              initial={shouldReduceMotion ? {} : { scale: 0.8, opacity: 0 }}
              animate={shouldReduceMotion ? {} : { scale: 1, opacity: 1 }}
              transition={shouldReduceMotion ? {} : { duration: 0.5, delay: 0.2 }}
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400/20 to-cyan-600/20 border border-cyan-400/30 flex items-center justify-center mx-auto mb-6">
                <ShoppingBag className="w-10 h-10 text-cyan-300" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-white">{t("noOrdersYet", language)}</h3>
              <p className="text-slate-300 text-base leading-relaxed mb-4 max-w-md mx-auto">{t("ordersArriveHere", language)}</p>
              <p className="text-sm text-slate-400/70">
                {t("firstOrder", language)}
              </p>
            </motion.div>
          </div>
        )}
      </div>

      {/* Menu Preview */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-white">{t("menuPreview", language)}</h2>
        <div className="space-y-3">
          {menu.slice(0, 5).map((categoria) => (
            <div key={categoria.id} className="flex items-center justify-between py-4 px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
              <div>
                <h3 className="font-bold text-white mb-1">{categoria.label}</h3>
                <p className="text-sm text-slate-400">{categoria.items.length} {t("products", language)}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" />
            </div>
          ))}
          {menu.length > 5 && (
            <Link href="/admin/categorias" className="block text-center text-sm text-cyan-300 hover:text-cyan-200 font-bold pt-4 transition-colors">
              {t("viewAllCategories", language)} ({menu.length})
            </Link>
          )}
          {menu.length === 0 && (
            <p className="text-slate-400 text-center py-8 text-sm">
              {t("noCategoriesConfigured", language)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
