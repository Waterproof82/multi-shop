'use client';

import { useState, useEffect } from 'react';
import { BarChart3, ShoppingCart, Euro, TrendingUp, TrendingDown, Users, Calendar, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from 'recharts';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';

interface Stats {
  pedidosHoy: number;
  pedidosMes: number;
  totalHoy: number;
  totalMes: number;
  totalAno: number;
  topPlatos: { nombre: string; cantidad: number; total: number }[];
  topPlatosAno: { nombre: string; cantidad: number; total: number }[];
  pedidosPorDia: { dia: number; pedidos: number; ingresos: number }[];
  clientesNuevos: number;
  clientesRecurrentes: number;
  ticketMedio: number;
  ticketMedioAnterior: number;
  pedidosAnterior: number;
  ingresosAnterior: number;
  mesSeleccionado: string;
}

interface ChartTheme {
  colors: string[];
  tickFill: string;
  gridStroke: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipColor: string;
}

const DEFAULT_CHART_THEME: ChartTheme = {
  colors: ['#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16'],
  tickFill: '#71717A',
  gridStroke: '#E4E4E7',
  tooltipBg: '#ffffff',
  tooltipBorder: '#E4E4E7',
  tooltipColor: '#18181B',
};

function getChartTheme(): ChartTheme {
  if (typeof window === 'undefined') return DEFAULT_CHART_THEME;
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => style.getPropertyValue(v).trim();
  return {
    colors: [
      get('--color-chart-orange') || '#F97316',
      get('--color-chart-blue') || '#3B82F6',
      get('--color-chart-green') || '#10B981',
      get('--color-chart-purple') || '#8B5CF6',
      get('--color-chart-pink') || '#EC4899',
      get('--color-chart-teal') || '#14B8A6',
      get('--color-chart-rose') || '#F43F5E',
      get('--color-chart-lime') || '#84CC16',
    ],
    tickFill: get('--muted-foreground') || '#71717A',
    gridStroke: get('--border') || '#E4E4E7',
    tooltipBg: get('--card') || '#ffffff',
    tooltipBorder: get('--border') || '#E4E4E7',
    tooltipColor: get('--foreground') || '#18181B',
  };
}

export default function EstadisticasPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  const meses = [t("monthJan", language), t("monthFeb", language), t("monthMar", language), t("monthApr", language), t("monthMay", language), t("monthJun", language), t("monthJul", language), t("monthAug", language), t("monthSep", language), t("monthOct", language), t("monthNov", language), t("monthDec", language)];
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState({ mes: new Date().getMonth(), año: new Date().getFullYear() });
  const [chartTheme, setChartTheme] = useState<ChartTheme>(DEFAULT_CHART_THEME);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const motionProps = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  useEffect(() => {
    setChartTheme(getChartTheme());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetchWithCsrf(`/api/admin/pedidos?empresaId=${effectiveEmpresaId}&mes=${selectedMonth.mes}&año=${selectedMonth.año}`, { method: 'PUT', signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        logClientError(error, 'fetchStats');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
    return () => controller.abort();
  }, [selectedMonth]);

  const cambiarMes = (delta: number) => {
    setSelectedMonth(prev => {
      let nuevoMes = prev.mes + delta;
      let nuevoAño = prev.año;
      
      if (nuevoMes < 0) {
        nuevoMes = 11;
        nuevoAño--;
      } else if (nuevoMes > 11) {
        nuevoMes = 0;
        nuevoAño++;
      }
      
      return { mes: nuevoMes, año: nuevoAño };
    });
  };

  const mesActual = selectedMonth.mes;
  const añoActual = selectedMonth.año;
  const esMesActual = mesActual === new Date().getMonth() && añoActual === new Date().getFullYear();

  if (loading) {
    return (
      <div className="pt-16 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("statsTitle", language)}</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{t("statsSubtitle", language)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => cambiarMes(-1)}
              aria-label={t("previousMonth", language)}
              className="p-2 rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-primary-foreground" />
            </button>
            <div className="px-4 py-2 bg-primary-foreground/20 rounded-lg min-w-[140px] text-center">
              <span className="font-medium text-primary-foreground">
                {meses[mesActual]} {añoActual}
              </span>
            </div>
            <button
              onClick={() => cambiarMes(1)}
              disabled={esMesActual}
              aria-label={t("nextMonth", language)}
              className="p-2 rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5 text-primary-foreground" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {[
          { icon: ShoppingCart, label: t("ordersToday", language), value: stats?.pedidosHoy || 0, iconClass: 'bg-muted', iconColor: 'text-foreground' },
          { icon: BarChart3, label: t("ordersMonth", language), value: stats?.pedidosMes || 0, iconClass: 'bg-primary/10', iconColor: 'text-primary' },
          { icon: Euro, label: t("salesToday", language), value: `${(stats?.totalHoy || 0).toFixed(2)}€`, iconClass: 'bg-primary/10', iconColor: 'text-primary' },
          { icon: BarChart3, label: t("salesMonth", language), value: `${(stats?.totalMes || 0).toFixed(2)}€`, iconClass: 'bg-muted', iconColor: 'text-foreground' },
          { icon: TrendingUp, label: t("salesYear", language), value: `${(stats?.totalAno || 0).toFixed(2)}€`, iconClass: 'bg-secondary', iconColor: 'text-secondary-foreground' },
        ].map((kpi, i) => (
          <motion.div
            key={`kpi-${i}`}
            {...motionProps}
            transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: i * 0.05 }}
            className="bg-card rounded-lg shadow-elegant border border-border p-6"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 ${kpi.iconClass} rounded-lg`}>
                <kpi.icon className={`w-5 h-5 ${kpi.iconColor}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <motion.div
          {...motionProps}
          transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.2 }}
          className="bg-card rounded-lg border border-border p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">{t("avgTicket", language)}</p>
            <Euro className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">{(stats?.ticketMedio || 0).toFixed(2)}€</p>
        </motion.div>

        <motion.div
          {...motionProps}
          transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.25 }}
          className="bg-card rounded-lg border border-border p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">{t("vsPreviousMonth", language)}</p>
            {stats && stats.pedidosAnterior > 0 ? (
              stats.pedidosMes >= stats.pedidosAnterior ? (
                <ArrowUpRight className="w-4 h-4 text-primary" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-destructive" />
              )
            ) : null}
          </div>
          {stats && stats.pedidosAnterior > 0 ? (
            <p className={`text-2xl font-bold ${stats.pedidosMes >= stats.pedidosAnterior ? 'text-primary' : 'text-destructive'}`}>
              {((stats.pedidosMes - stats.pedidosAnterior) / stats.pedidosAnterior * 100).toFixed(1)}%
            </p>
          ) : (
            <p className="text-2xl font-bold text-muted-foreground">--</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {stats?.pedidosAnterior || 0} {t("ordersPreviousMonth", language)}
          </p>
        </motion.div>

        <motion.div
          {...motionProps}
          transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.3 }}
          className="bg-card rounded-lg border border-border p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">{t("clientsTitle", language)}</p>
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">{(stats?.clientesNuevos || 0) + (stats?.clientesRecurrentes || 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {(stats?.clientesNuevos || 0)} {t("newClientsLabel", language)}, {(stats?.clientesRecurrentes || 0)} {t("returningClients", language)}
          </p>
        </motion.div>
      </div>

      {/* Daily Orders Chart */}
      {stats?.pedidosPorDia && stats.pedidosPorDia.length > 0 && (
        <motion.div
          {...motionProps}
          transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.35 }}
          className="bg-card rounded-lg border border-border p-6 mb-6"
        >
          <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t("ordersByDay", language)} ({meses[mesActual]})
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.pedidosPorDia}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 12, fill: chartTheme.tickFill }}
                  tickFormatter={(value) => `${value}`}
                  axisLine={{ stroke: chartTheme.gridStroke }}
                  tickLine={{ stroke: chartTheme.gridStroke }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: chartTheme.tickFill }}
                  axisLine={{ stroke: chartTheme.gridStroke }}
                  tickLine={{ stroke: chartTheme.gridStroke }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTheme.tooltipBg,
                    border: `1px solid ${chartTheme.tooltipBorder}`,
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: chartTheme.tooltipColor }}
                  itemStyle={{ color: chartTheme.tooltipColor }}
                  formatter={(value: number, name: string) => [
                    name === 'pedidos' ? `${value} ${t("xOrders", language)}` : `${value.toFixed(2)}€`,
                    name === 'pedidos' ? t("xOrders", language) : t("revenueLabel", language)
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="pedidos"
                  stroke={chartTheme.colors[0]}
                  strokeWidth={2}
                  dot={{ fill: chartTheme.colors[0], r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          key="chart-bar"
          {...motionProps}
          transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.25 }}
          className="bg-card rounded-lg shadow-elegant border border-border p-6"
        >
          <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            {t("topDishes", language)} ({t("thisMonthLabel", language)})
          </h2>
          
          {stats?.topPlatos && stats.topPlatos.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topPlatos.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartTheme.gridStroke} />
                  <XAxis type="number" hide axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={100}
                    tick={{ fontSize: 12, fill: chartTheme.tickFill }}
                    axisLine={{ stroke: chartTheme.gridStroke }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: chartTheme.tooltipColor }}
                    itemStyle={{ color: chartTheme.tooltipColor }}
                  />
                  <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} animationDuration={800}>
                    {stats.topPlatos.slice(0, 8).map((plato, index) => (
                      <Cell
                        key={`${plato.nombre}-bar`}
                        fill={chartTheme.colors[index % chartTheme.colors.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              {t("noStatsData", language)}
            </p>
          )}
        </motion.div>

        <motion.div
          key="chart-pie"
          {...motionProps}
          transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.3 }}
          className="bg-card rounded-lg shadow-elegant border border-border p-6"
        >
          <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
            <Euro className="w-5 h-5" />
            {t("revenueByDish", language)} ({t("thisMonthLabel", language)})
          </h2>
          
          {stats?.topPlatos && stats.topPlatos.length > 0 ? (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart key="pie-chart">
                    <Pie
                      data={stats.topPlatos.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="total"
                      nameKey="nombre"
                      animationDuration={800}
                    >
                      {stats.topPlatos.slice(0, 8).map((plato, index) => (
                        <Cell
                          key={`${plato.nombre}-pie`}
                          fill={chartTheme.colors[index % chartTheme.colors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => `${value.toFixed(2)}€`}
                      contentStyle={{
                        backgroundColor: chartTheme.tooltipBg,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: chartTheme.tooltipColor }}
                      itemStyle={{ color: chartTheme.tooltipColor }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {stats.topPlatos.slice(0, 6).map((plato, index) => (
                  <div key={plato.nombre} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: chartTheme.colors[index % chartTheme.colors.length] }}
                    />
                    <span className="truncate text-muted-foreground">{plato.nombre}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              {t("noStatsData", language)}
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
