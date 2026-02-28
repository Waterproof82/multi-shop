'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { BarChart3, ShoppingCart, Euro, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';

interface Stats {
  pedidosHoy: number;
  pedidosMes: number;
  totalHoy: number;
  totalMes: number;
  totalAno: number;
  topPlatos: { nombre: string; cantidad: number; total: number }[];
  mesSeleccionado: string;
}

const meses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function getInitialMonth(): { mes: number; año: number } {
  const now = new Date();
  return { mes: now.getMonth(), año: now.getFullYear() };
}

function EstadisticasContent({ mountKey }: { mountKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const [chartKey, setChartKey] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth());

  useEffect(() => {
    if (stats) {
      setChartKey(prev => prev + 1);
    }
  }, [stats]);

  const isDark = theme === 'dark';

  const tooltipStyle = {
    backgroundColor: isDark ? '#1F2937' : '#fff',
    border: 'none',
    borderRadius: '8px',
    color: isDark ? '#fff' : '#1F2937',
    boxShadow: isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
  };

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/pedidos?mes=${selectedMonth.mes}&año=${selectedMonth.año}`, { method: 'PUT' });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
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
      <div className="pt-20 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-1">
            Estadísticas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Resumen de pedidos y facturación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => cambiarMes(-1)}
            className="p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 min-w-[160px] text-center">
            <span className="font-medium text-gray-900 dark:text-white">
              {meses[mesActual]} {añoActual}
            </span>
          </div>
          <button
            onClick={() => cambiarMes(1)}
            disabled={esMesActual}
            className="p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <motion.div
          key={`kpi-1-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pedidos hoy</p>
              <motion.p 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="text-2xl font-bold text-gray-900 dark:text-white"
              >
                {stats?.pedidosHoy || 0}
              </motion.p>
            </div>
          </div>
        </motion.div>

        <motion.div
          key={`kpi-2-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pedidos mes</p>
              <motion.p 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="text-2xl font-bold text-gray-900 dark:text-white"
              >
                {stats?.pedidosMes || 0}
              </motion.p>
            </div>
          </div>
        </motion.div>

        <motion.div
          key={`kpi-3-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Euro className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ventas hoy</p>
              <motion.p 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className="text-2xl font-bold text-gray-900 dark:text-white"
              >
                {(stats?.totalHoy || 0).toFixed(2)}€
              </motion.p>
            </div>
          </div>
        </motion.div>

        <motion.div
          key={`kpi-4-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ventas mes</p>
              <motion.p 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, duration: 0.3 }}
                className="text-2xl font-bold text-gray-900 dark:text-white"
              >
                {(stats?.totalMes || 0).toFixed(2)}€
              </motion.p>
            </div>
          </div>
        </motion.div>

        <motion.div
          key={`kpi-5-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ventas año</p>
              <motion.p 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.55, duration: 0.3 }}
                className="text-2xl font-bold text-gray-900 dark:text-white"
              >
                {(stats?.totalAno || 0).toFixed(2)}€
              </motion.p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          key={`chart-bar-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6"
        >
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Platos más pedidos (este mes)
          </h2>
          
          {stats?.topPlatos && stats.topPlatos.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  key={`bar-${mountKey}`}
                  data={stats.topPlatos.slice(0, 8)} 
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis type="number" stroke="#9CA3AF" />
                  <YAxis 
                    dataKey="nombre" 
                    type="category" 
                    stroke="#9CA3AF" 
                    width={110}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value} uds`, 'Cantidad']}
                  />
                  <Bar 
                    dataKey="cantidad" 
                    radius={[0, 4, 4, 0]}
                    animationDuration={1500}
                  >
                    {stats.topPlatos.slice(0, 8).map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={['#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16'][index % 8]} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay datos suficientes para mostrar estadísticas
            </p>
          )}
        </motion.div>

        <motion.div 
          key={`chart-pie-${mountKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6"
        >
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <Euro className="w-5 h-5" />
            Ingresos por plato
          </h2>
          
          {stats?.topPlatos && stats.topPlatos.length > 0 ? (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart key={`pie-${mountKey}`}>
                    <Pie
                      data={stats.topPlatos.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="total"
                      nameKey="nombre"
                      animationDuration={1500}
                    >
                      {stats.topPlatos.slice(0, 8).map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={['#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16'][index % 8]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`${value.toFixed(2)}€`, 'Ingreso']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2 px-2">
                {stats.topPlatos.slice(0, 8).map((plato, index) => (
                  <div key={plato.nombre} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: ['#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16'][index % 8] }}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[100px]">{plato.nombre}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No hay datos suficientes para mostrar estadísticas
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function EstadisticasPage() {
  const pathname = usePathname();
  const [pageKey, setPageKey] = useState(0);

  useEffect(() => {
    setPageKey(prev => prev + 1);
  }, [pathname]);

  return <EstadisticasContent mountKey={pageKey} />;
}
