'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart3, ShoppingCart, Euro, TrendingUp, Users, Calendar, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { logClientError } from '@/lib/client-error';
import { useLanguage } from '@/lib/language-context';
import { useAdmin } from '@/lib/admin-context';
import { t } from '@/lib/translations';
import {
  BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, LineChart, Line, Bar, Pie,
  type TooltipProps,
} from 'recharts';


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
  if (globalThis.window === undefined) return DEFAULT_CHART_THEME;
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

function getKpiData(stats: Stats | null, lang: Parameters<typeof t>[1]) {
  return [
    { icon: ShoppingCart, label: t("ordersToday", lang), value: stats?.pedidosHoy || 0, iconClass: 'bg-muted', iconColor: 'text-foreground' },
    { icon: BarChart3, label: t("ordersMonth", lang), value: stats?.pedidosMes || 0, iconClass: 'bg-primary/10', iconColor: 'text-primary' },
    { icon: Euro, label: t("salesToday", lang), value: `${(stats?.totalHoy || 0).toFixed(2)}€`, iconClass: 'bg-primary/10', iconColor: 'text-primary' },
    { icon: BarChart3, label: t("salesMonth", lang), value: `${(stats?.totalMes || 0).toFixed(2)}€`, iconClass: 'bg-muted', iconColor: 'text-foreground' },
    { icon: TrendingUp, label: t("salesYear", lang), value: `${(stats?.totalAno || 0).toFixed(2)}€`, iconClass: 'bg-secondary', iconColor: 'text-secondary-foreground' },
  ];
}

function getMonthNavigation(selectedMonth: { mes: number; año: number }) {
  const cambiarMes = (delta: number) => {
    const nuevoMes = selectedMonth.mes + delta;
    const nuevoAño = selectedMonth.año + Math.floor(nuevoMes / 12);
    const mesAjustado = ((nuevoMes % 12) + 12) % 12;
    return { mes: mesAjustado, año: nuevoAño };
  };

  const mesActual = selectedMonth.mes;
  const añoActual = selectedMonth.año;
  const esMesActual = mesActual === new Date().getMonth() && añoActual === new Date().getFullYear();

  return { cambiarMes, mesActual, añoActual, esMesActual };
}

// Custom hook for fetching stats
function useStatsFetching(empresaId: string, selectedMonth: { mes: number; año: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetchWithCsrf(`/api/admin/pedidos?empresaId=${empresaId}&mes=${selectedMonth.mes}&año=${selectedMonth.año}`, { method: 'PUT', signal: controller.signal });
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
  }, [selectedMonth, empresaId]);

  return { stats, loading };
}

// Custom hook for chart theme
function useChartTheme() {
  const [chartTheme, setChartTheme] = useState<ChartTheme>(DEFAULT_CHART_THEME);

  useEffect(() => {
    setChartTheme(getChartTheme());
  }, []);

  return chartTheme;
}

// Custom hook for motion props
function useMotionProps() {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const motionProps = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };
  return { motionProps, shouldReduceMotion };
}

// KPI Card component
function KpiCard({ kpi, motionProps, shouldReduceMotion, index }: Readonly<{ 
  kpi: ReturnType<typeof getKpiData>[number]; 
  motionProps: object;
  shouldReduceMotion: boolean;
  index: number;
}>) {
  return (
    <motion.div
      key={`kpi-${kpi.label}`}
      {...motionProps}
      transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: index * 0.05 }}
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
  );
}

// Average ticket card component
function AvgTicketCard({ stats, language, motionProps, shouldReduceMotion }: Readonly<{
  stats: Stats | null;
  language: string;
  motionProps: object;
  shouldReduceMotion: boolean;
}>) {
  const lang = language as Parameters<typeof t>[1];
  return (
    <motion.div
      {...motionProps}
      transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.2 }}
      className="bg-card rounded-lg border border-border p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{t("avgTicket", lang)}</p>
        <Euro className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold text-foreground">{(stats?.ticketMedio || 0).toFixed(2)}€</p>
    </motion.div>
  );
}

// Comparison card component
function ComparisonCard({ stats, language, motionProps, shouldReduceMotion }: Readonly<{ 
  stats: Stats | null; 
  language: string;
  motionProps: object;
  shouldReduceMotion: boolean;
}>) {
  const lang = language as Parameters<typeof t>[1];
  const pedidosChange = stats && stats.pedidosAnterior > 0
    ? ((stats.pedidosMes - stats.pedidosAnterior) / stats.pedidosAnterior * 100)
    : null;
  const isPositive = pedidosChange !== null && pedidosChange >= 0;
  const showComparison = stats && stats.pedidosAnterior > 0;

  return (
    <motion.div
      {...motionProps}
      transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.25 }}
      className="bg-card rounded-lg border border-border p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{t("vsPreviousMonth", lang)}</p>
        {showComparison && (
          isPositive ? <ArrowUpRight className="w-4 h-4 text-primary" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />
        )}
      </div>
      {showComparison ? (
        <p className={`text-2xl font-bold ${isPositive ? 'text-primary' : 'text-destructive'}`}>
          {pedidosChange?.toFixed(1)}%
        </p>
      ) : (
        <p className="text-2xl font-bold text-muted-foreground">--</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        {stats?.pedidosAnterior || 0} {t("ordersPreviousMonth", lang)}
      </p>
    </motion.div>
  );
}

// Clients card component
function ClientsCard({ stats, language, motionProps, shouldReduceMotion }: Readonly<{
  stats: Stats | null;
  language: string;
  motionProps: object;
  shouldReduceMotion: boolean;
}>) {
  const lang = language as Parameters<typeof t>[1];
  return (
    <motion.div
      {...motionProps}
      transition={shouldReduceMotion ? undefined : { duration: 0.3, delay: 0.3 }}
      className="bg-card rounded-lg border border-border p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{t("clientsTitle", lang)}</p>
        <Users className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold text-foreground">{(stats?.clientesNuevos || 0) + (stats?.clientesRecurrentes || 0)}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {(stats?.clientesNuevos || 0)} {t("newClientsLabel", lang)}, {(stats?.clientesRecurrentes || 0)} {t("returningClients", lang)}
      </p>
    </motion.div>
  );
}

// Stats header component
function StatsHeader({ language, meses, mesActual, añoActual, esMesActual, onMonthChange }: Readonly<{
  language: string;
  meses: string[];
  mesActual: number;
  añoActual: number;
  esMesActual: boolean;
  onMonthChange: (delta: number) => void;
}>) {
  const lang = language as Parameters<typeof t>[1];
  return (
    <div className="bg-primary rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">{t("statsTitle", lang)}</h1>
          <p className="text-primary-foreground/80 text-sm mt-1">{t("statsSubtitle", lang)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMonthChange(-1)}
            aria-label={t("previousMonth", lang)}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <ChevronLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <div className="px-4 py-2 bg-primary-foreground/20 rounded-lg min-w-[140px] text-center">
            <span className="font-medium text-primary-foreground">
              {meses[mesActual]} {añoActual}
            </span>
          </div>
          <button
            onClick={() => onMonthChange(1)}
            disabled={esMesActual}
            aria-label={t("nextMonth", lang)}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <ChevronRight className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="pt-16 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function EstadisticasPage() {
  const { language } = useLanguage();
  const { empresaId, overrideEmpresaId } = useAdmin();
  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  const lang = language;
  const meses = [t("monthJan", lang), t("monthFeb", lang), t("monthMar", lang), t("monthApr", lang), t("monthMay", lang), t("monthJun", lang), t("monthJul", lang), t("monthAug", lang), t("monthSep", lang), t("monthOct", lang), t("monthNov", lang), t("monthDec", lang)];
  const [selectedMonth, setSelectedMonth] = useState({ mes: new Date().getMonth(), año: new Date().getFullYear() });
  
  const { stats, loading } = useStatsFetching(effectiveEmpresaId, selectedMonth);
  const chartTheme = useChartTheme();
  const { motionProps, shouldReduceMotion } = useMotionProps();

  const { cambiarMes, mesActual, añoActual, esMesActual } = getMonthNavigation(selectedMonth);

  const handleCambiarMes = (delta: number) => {
    setSelectedMonth(prev => cambiarMes(delta));
  };

  const kpis = useMemo(() => getKpiData(stats, lang), [stats, lang]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <StatsHeader
        language={language}
        meses={meses}
        mesActual={mesActual}
        añoActual={añoActual}
        esMesActual={esMesActual}
        onMonthChange={handleCambiarMes}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {kpis.map((kpi, i) => (
          <KpiCard key={`kpi-${kpi.label}`} kpi={kpi} motionProps={motionProps} shouldReduceMotion={shouldReduceMotion} index={i} />
        ))}
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <AvgTicketCard stats={stats} language={lang} motionProps={motionProps} shouldReduceMotion={shouldReduceMotion} />
        <ComparisonCard stats={stats} language={lang} motionProps={motionProps} shouldReduceMotion={shouldReduceMotion} />
        <ClientsCard stats={stats} language={lang} motionProps={motionProps} shouldReduceMotion={shouldReduceMotion} />
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
          <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height={192} minWidth={0}>
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
                    formatter={((value: number, name: string) => [
                      name === 'pedidos' ? `${value} ${t("xOrders", language)}` : `${value.toFixed(2)}€`,
                      name === 'pedidos' ? t("xOrders", language) : t("revenueLabel", language)
                    ]) as TooltipProps<number, string>['formatter']}
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
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
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
              <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height={256} minWidth={0}>
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
                        formatter={((value: number) => `${value.toFixed(2)}€`) as TooltipProps<number, string>['formatter']}
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
