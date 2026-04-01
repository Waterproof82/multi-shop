'use client';

// This component wraps ALL Recharts-heavy visualizations
// It's loaded dynamically to reduce initial bundle size (~100KB)
import {
  BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, LineChart, Line, Bar, Pie,
  type TooltipProps,
} from 'recharts';
import { formatPrice } from '@/lib/format-price';
import { translations } from '@/lib/translations';
import type { Language } from '@/lib/language-context';

type TranslationKey = keyof typeof translations.es;
type TranslateFn = (key: TranslationKey, lang: Language) => string;

interface ChartTheme {
  colors: string[];
  tickFill: string;
  gridStroke: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipColor: string;
}

interface Stats {
  topPlatos: { nombre: string; cantidad: number; total: number }[];
  pedidosPorDia: { dia: number; pedidos: number; ingresos: number }[];
}

interface PromoStat {
  id: string;
  fecha_hora: string;
  texto_promocion: string;
  numero_envios: number;
}

interface TgtgItemStat {
  id: string;
  titulo: string;
  precioOriginal: number;
  precioDescuento: number;
  cuponesTotal: number;
  cuponesDisponibles: number;
  reservasCount: number;
}

interface TgtgPromoStat {
  id: string;
  fechaActivacion: string;
  horaRecogidaInicio: string;
  horaRecogidaFin: string;
  numeroEnvios: number;
  emailEnviado: boolean;
  items: TgtgItemStat[];
}

interface AdminChartsProps {
  stats: Stats | null;
  promos: PromoStat[];
  tgtgCampaigns: TgtgPromoStat[];
  chartTheme: ChartTheme;
  language: Language;
  dateLocale: string;
  meses: string[];
  mesActual: number;
  t: TranslateFn;
}

// ─── Daily Orders Chart ────────────────────────────────────────
function DailyOrdersChart({ 
  pedidosPorDia, 
  chartTheme, 
  language, 
  meses, 
  mesActual,
  t 
}: { 
  pedidosPorDia: Stats['pedidosPorDia'];
  chartTheme: ChartTheme;
  language: Language;
  meses: string[];
  mesActual: number;
  t: TranslateFn;
}) {
  if (!pedidosPorDia?.length) return null;
  
  return (
    <div className="bg-card rounded-lg border border-border p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {t("ordersByDay", language)} ({meses[mesActual]})
      </h2>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height={192} minWidth={0}>
          <LineChart data={pedidosPorDia}>
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
                name === 'pedidos' ? `${value} ${t("xOrders", language)}` : formatPrice(value, 'EUR', language),
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
    </div>
  );
}

// ─── Top Dishes Chart ──────────────────────────────────────────
function TopDishesChart({ 
  topPlatos, 
  chartTheme, 
  language,
  t 
}: { 
  topPlatos: Stats['topPlatos'];
  chartTheme: ChartTheme;
  language: Language;
  t: TranslateFn;
}) {
  if (!topPlatos?.length) {
    return (
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          {t("topDishes", language)} ({t("thisMonthLabel", language)})
        </h2>
        <p className="text-muted-foreground text-center py-8">
          {t("noStatsData", language)}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-elegant border border-border p-6">
      <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {t("topDishes", language)} ({t("thisMonthLabel", language)})
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height={256} minWidth={0}>
          <BarChart data={topPlatos.slice(0, 8)} layout="vertical">
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
              {topPlatos.slice(0, 8).map((plato, index) => (
                <Cell
                  key={`${plato.nombre}-bar`}
                  fill={chartTheme.colors[index % chartTheme.colors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Revenue Pie Chart ──────────────────────────────────────────
function RevenuePieChart({ 
  topPlatos, 
  chartTheme, 
  language,
  t 
}: { 
  topPlatos: Stats['topPlatos'];
  chartTheme: ChartTheme;
  language: Language;
  t: TranslateFn;
}) {
  if (!topPlatos?.length) {
    return (
      <div className="bg-card rounded-lg shadow-elegant border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t("revenueByDish", language)} ({t("thisMonthLabel", language)})
        </h2>
        <p className="text-muted-foreground text-center py-8">
          {t("noStatsData", language)}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-elegant border border-border p-6">
      <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t("revenueByDish", language)} ({t("thisMonthLabel", language)})
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height={256} minWidth={0}>
          <PieChart key="pie-chart">
            <Pie
              data={topPlatos.slice(0, 8)}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="total"
              nameKey="nombre"
              animationDuration={800}
            >
              {topPlatos.slice(0, 8).map((plato, index) => (
                <Cell
                  key={`${plato.nombre}-pie`}
                  fill={chartTheme.colors[index % chartTheme.colors.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={((value: number) => formatPrice(value, 'EUR', language)) as TooltipProps<number, string>['formatter']}
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
        {topPlatos.slice(0, 6).map((plato, index) => (
          <div key={plato.nombre} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: chartTheme.colors[index % chartTheme.colors.length] }}
            />
            <span className="truncate text-muted-foreground">{plato.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Promo Stats Chart ─────────────────────────────────────────
function PromoStatsChart({ 
  promos, 
  chartTheme, 
  language,
  dateLocale,
  t 
}: { 
  promos: PromoStat[];
  chartTheme: ChartTheme;
  language: Language;
  dateLocale: string;
  t: TranslateFn;
}) {
  if (!promos.length) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 py-8 text-center">
        <svg className="w-10 h-10 text-muted-foreground mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-muted-foreground">{t("statsNoPromosSent", language)}</p>
      </div>
    );
  }

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth();

  const thisMonthPromos = promos.filter(p => {
    const d = new Date(p.fecha_hora);
    return d.getFullYear() === cy && d.getMonth() === cm;
  });

  const totalEnvios = promos.reduce((acc, p) => acc + p.numero_envios, 0);
  const mesEnvios = thisMonthPromos.reduce((acc, p) => acc + p.numero_envios, 0);
  const maxEnvios = Math.max(...promos.map(p => p.numero_envios));
  const topPromo = promos.find(p => p.numero_envios === maxEnvios);

  const byMonth: Record<string, number> = {};
  for (const p of promos) {
    const key = new Date(p.fecha_hora).toLocaleDateString(dateLocale, { month: 'short', year: '2-digit' });
    byMonth[key] = (byMonth[key] ?? 0) + p.numero_envios;
  }
  const chartData = Object.entries(byMonth).map(([mes, envios]) => ({ mes, envios })).slice(-12);

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        {t("statsPromoSends", language)}
      </h2>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-primary">{promos.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsPromosSent", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-foreground">{thisMonthPromos.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsSentThisMonth", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-foreground">{totalEnvios.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsTotalEmails", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-foreground">{mesEnvios.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsEmailsThisMonth", language)}</p>
        </div>
      </div>

      {/* Top promo highlight */}
      {topPromo && (
        <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🏆</span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("statsTopPromo", language)}</p>
            <p className="text-sm font-semibold text-foreground truncate">{topPromo.texto_promocion}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(topPromo.fecha_hora).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' })} · <span className="font-medium text-primary">{topPromo.numero_envios} emails</span>
            </p>
          </div>
        </div>
      )}

      {/* Chart: envíos by month */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">{t("statsEmailsByMonth", language)}</p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height={160} minWidth={0}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px' }}
                labelStyle={{ color: chartTheme.tooltipColor }}
                itemStyle={{ color: chartTheme.tooltipColor }}
                formatter={(value: number) => [`${value.toLocaleString()} emails`, t("statsSendCountLabel", language)]}
              />
              <Bar dataKey="envios" fill={chartTheme.colors[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("date", language)}</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">{t("statsMessageLabel", language)}</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Emails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {promos.map(p => (
              <tr key={p.id} className="bg-card hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(p.fecha_hora).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <p className="text-foreground text-sm truncate max-w-xs">{p.texto_promocion}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-primary">{p.numero_envios.toLocaleString(dateLocale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TGTG Stats Chart ──────────────────────────────────────────
function TgtgStatsChart({ 
  tgtgCampaigns, 
  chartTheme, 
  language,
  dateLocale,
  t 
}: { 
  tgtgCampaigns: TgtgPromoStat[];
  chartTheme: ChartTheme;
  language: Language;
  dateLocale: string;
  t: TranslateFn;
}) {
  if (!tgtgCampaigns.length) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 py-8 text-center">
        <svg className="w-10 h-10 text-muted-foreground mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <p className="text-sm text-muted-foreground">{t("statsNoCampaigns", language)}</p>
      </div>
    );
  }

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth();

  const sentCampaigns = tgtgCampaigns.filter(c => c.emailEnviado);
  const thisMonthCampaigns = sentCampaigns.filter(c => {
    const d = new Date(c.fechaActivacion + 'T00:00:00');
    return d.getFullYear() === cy && d.getMonth() === cm;
  });

  const sumStats = (cams: TgtgPromoStat[]) => ({
    reservas: cams.reduce((acc, c) => acc + c.items.reduce((a, i) => a + i.reservasCount, 0), 0),
    revenue: cams.reduce((acc, c) => acc + c.items.reduce((a, i) => a + i.precioDescuento * i.reservasCount, 0), 0),
    saved: cams.reduce((acc, c) => acc + c.items.reduce((a, i) => a + (i.precioOriginal - i.precioDescuento) * i.reservasCount, 0), 0),
  });

  const allStats = sumStats(sentCampaigns);
  const monthStats = sumStats(thisMonthCampaigns);

  const totalCampaigns = tgtgCampaigns.length;
  const chartData = [...tgtgCampaigns].reverse().slice(0, 6).map((c, idx) => ({
    label: `#${idx + 1}`,
    fecha: new Date(c.fechaActivacion + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }),
    reservas: c.items.reduce((acc, i) => acc + i.reservasCount, 0),
    ingresos: Number(c.items.reduce((acc, i) => acc + i.precioDescuento * i.reservasCount, 0).toFixed(2)),
  }));

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        TooGoodToGo
      </h2>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{sentCampaigns.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsTgtgCampaignsSent", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-foreground">{thisMonthCampaigns.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsSentThisMonth", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-foreground">{allStats.reservas}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsTgtgReservasTotal", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-600">{formatPrice(monthStats.revenue, 'EUR', language)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsTgtgRevenueMonth", language)}</p>
        </div>
        <div className="bg-muted rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-foreground">{formatPrice(allStats.revenue, 'EUR', language)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("statsTgtgRevenueTotal", language)}</p>
        </div>
      </div>

      {/* Savings highlight */}
      {allStats.saved > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">🌱</span>
          <div>
            <p className="text-sm font-medium text-foreground">{formatPrice(allStats.saved, 'EUR', language)} {t("statsTgtgSavedBy", language)}</p>
            <p className="text-xs text-muted-foreground">{t("statsTgtgSavingsHelp", language)}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.some(d => d.reservas > 0 || d.ingresos > 0) && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">{t("statsTgtgChartTitle", language)}</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height={160} minWidth={0}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px' }}
                  labelStyle={{ color: chartTheme.tooltipColor, fontWeight: 600 }}
                  itemStyle={{ color: chartTheme.tooltipColor }}
                  labelFormatter={(label: string) => {
                    const entry = chartData.find(d => d.label === label);
                    return entry ? `${label} · ${entry.fecha}` : label;
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'reservas' ? `${value} ${t("tgtgReservas", language)}` : formatPrice(value, 'EUR', language),
                    name === 'reservas' ? t("tgtgReservas", language) : t("revenueLabel", language),
                  ]}
                />
                <Bar dataKey="reservas" fill={chartTheme.colors[2]} radius={[4, 4, 0, 0]} name="reservas" />
                <Bar dataKey="ingresos" fill={chartTheme.colors[3]} radius={[4, 4, 0, 0]} name="ingresos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{t("statsTgtgCampaignHeader", language)}</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">{t("statsTgtgScheduleHeader", language)}</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Emails</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">{t("tgtgReservas", language)}</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">{t("revenueLabel", language)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tgtgCampaigns.map((c, idx) => {
              const num = totalCampaigns - idx;
              const reservas = c.items.reduce((acc, i) => acc + i.reservasCount, 0);
              const revenue = c.items.reduce((acc, i) => acc + i.precioDescuento * i.reservasCount, 0);
              const firstTitle = c.items[0]?.titulo ?? '—';
              const extraItems = c.items.length - 1;
              return (
                <tr key={c.id} className="bg-card hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    #{num}
                  </td>
                  <td className="px-4 py-3 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate max-w-[180px]">{firstTitle}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(c.fechaActivacion + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                      {extraItems > 0 && (
                        <span className="text-xs text-muted-foreground">+{extraItems} {extraItems > 1 ? t("statsExtraOffers", language) : t("statsExtraOffer", language)}</span>
                      )}
                      {c.emailEnviado
                        ? <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded-full">{t("statsTgtgStatusSent", language)}</span>
                        : <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{t("statsTgtgStatusDraft", language)}</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                    {c.horaRecogidaInicio.slice(0, 5)} – {c.horaRecogidaFin.slice(0, 5)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{c.numeroEnvios}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{reservas}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600 hidden md:table-cell">
                    {formatPrice(revenue, 'EUR', language)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────
export function AdminCharts(props: AdminChartsProps) {
  return (
    <>
      <DailyOrdersChart 
        pedidosPorDia={props.stats?.pedidosPorDia ?? []} 
        chartTheme={props.chartTheme}
        language={props.language}
        meses={props.meses}
        mesActual={props.mesActual}
        t={props.t}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopDishesChart 
          topPlatos={props.stats?.topPlatos ?? []} 
          chartTheme={props.chartTheme}
          language={props.language}
          t={props.t}
        />
        
        <RevenuePieChart 
          topPlatos={props.stats?.topPlatos ?? []} 
          chartTheme={props.chartTheme}
          language={props.language}
          t={props.t}
        />
      </div>

      <PromoStatsChart 
        promos={props.promos}
        chartTheme={props.chartTheme}
        language={props.language}
        dateLocale={props.dateLocale}
        t={props.t}
      />

      <TgtgStatsChart 
        tgtgCampaigns={props.tgtgCampaigns}
        chartTheme={props.chartTheme}
        language={props.language}
        dateLocale={props.dateLocale}
        t={props.t}
      />
    </>
  );
}
