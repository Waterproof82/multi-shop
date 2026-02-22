'use client';

import { useState, useEffect } from 'react';
import { BarChart3, ShoppingCart, Euro, TrendingUp } from 'lucide-react';

interface Stats {
  pedidosHoy: number;
  pedidosMes: number;
  totalHoy: number;
  totalMes: number;
  topPlatos: { nombre: string; cantidad: number; total: number }[];
}

export default function EstadisticasPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/pedidos', { method: 'PUT' });
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
  }, []);

  const maxCantidad = stats?.topPlatos?.[0]?.cantidad || 1;

  if (loading) {
    return (
      <div className="pt-20 lg:pt-0 px-6 lg:px-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="pt-20 lg:pt-0 px-6 lg:px-8">
      <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">
        Estadísticas
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Resumen de pedidos y facturación
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pedidos hoy</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.pedidosHoy || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pedidos mes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.pedidosMes || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Euro className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ventas hoy</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{(stats?.totalHoy || 0).toFixed(2)}€</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ventas mes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{(stats?.totalMes || 0).toFixed(2)}€</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Platos más pedidos (este mes)
        </h2>
        
        {stats?.topPlatos && stats.topPlatos.length > 0 ? (
          <div className="space-y-3">
            {stats.topPlatos.map((plato, index) => (
              <div key={plato.nombre} className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-6">
                  #{index + 1}
                </span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{plato.nombre}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{plato.cantidad} uds ({plato.total.toFixed(2)}€)</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(plato.cantidad / maxCantidad) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No hay datos suficientes para mostrar estadísticas
          </p>
        )}
      </div>
    </div>
  );
}
