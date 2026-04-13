import Image from 'next/image';
import { Building2, Users, ShoppingCart, Package, AlertCircle, TrendingUp, Calendar, Trophy } from 'lucide-react';
import { superAdminUseCase } from '@/core/infrastructure/database';
import { EmpresasTable } from './empresas-table';

interface EmpresaStats {
  totalPedidos: number;
  pedidosPendientes: number;
  totalClientes: number;
  totalProductos: number;
  pedidosHoy: number;
  pedidosMes: number;
  cuponesPromoValidados: number;
  cuponesTgtgValidados: number;
  cuponesTgtgTotales: number;
}

interface Empresa {
  id: string;
  nombre: string;
  dominio: string;
  logoUrl: string | null;
  emailNotification: string | null;
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
  createdAt: string;
  stats: EmpresaStats;
}

interface GlobalStats {
  totalEmpresas: number;
  totalPedidos: number;
  totalPedidosHoy: number;
  totalPedidosMes: number;
  totalClientes: number;
  totalProductos: number;
  empresasRanking: {
    empresaId: string;
    empresaNombre: string;
    empresaDominio: string;
    empresaLogoUrl: string | null;
    pedidosMes: number;
    posicion: number;
  }[];
}

function getPositionClasses(posicion: number): string {
  switch (posicion) {
    case 1: return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300';
    case 2: return 'bg-muted text-muted-foreground';
    case 3: return 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300';
    default: return 'bg-muted text-muted-foreground';
  }
}

async function getData(): Promise<{ empresas: Empresa[]; globalStats: GlobalStats | null; error: string | null }> {
  try {
    const empresasResult = await superAdminUseCase.getAllEmpresas();
    if (!empresasResult.success) {
      return { empresas: [], globalStats: null, error: empresasResult.error.message };
    }

    const globalStatsResult = await superAdminUseCase.getGlobalStats();
    if (!globalStatsResult.success) {
      return { empresas: empresasResult.data, globalStats: null, error: globalStatsResult.error.message };
    }

    return { 
      empresas: empresasResult.data, 
      globalStats: globalStatsResult.data,
      error: null 
    };
  } catch (e) {
    return { 
      empresas: [], 
      globalStats: null, 
      error: e instanceof Error ? e.message : 'Error desconocido' 
    };
  }
}

export default async function SuperAdminPage() {
  const { empresas, globalStats, error: fetchError } = await getData();

  const totalStats = empresas.reduce((acc, emp) => ({
    totalPedidos: acc.totalPedidos + emp.stats.totalPedidos,
    pedidosPendientes: acc.pedidosPendientes + emp.stats.pedidosPendientes,
    totalClientes: acc.totalClientes + emp.stats.totalClientes,
    totalProductos: acc.totalProductos + emp.stats.totalProductos,
    pedidosHoy: acc.pedidosHoy + emp.stats.pedidosHoy,
    pedidosMes: acc.pedidosMes + emp.stats.pedidosMes,
  }), { totalPedidos: 0, pedidosPendientes: 0, totalClientes: 0, totalProductos: 0, pedidosHoy: 0, pedidosMes: 0 });

  const pedidosHoy = globalStats?.totalPedidosHoy ?? totalStats.pedidosHoy;
  const pedidosMes = globalStats?.totalPedidosMes ?? totalStats.pedidosMes;
  const ranking = globalStats?.empresasRanking ?? [];

  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Resumen General</h2>
        <p className="text-slate-300 mt-1">Estado de todas las empresas</p>
      </div>

      {/* Stats Cards - Colorful */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="backdrop-blur-xl bg-gradient-to-br from-violet-500/20 to-violet-700/20 border border-violet-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-shadow duration-300">
          <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-violet-300 mx-auto mb-2" />
          <span className="text-lg sm:text-2xl font-semibold text-white">{empresas.length}</span>
          <p className="text-violet-300 text-[10px] sm:text-xs">Empresas</p>
        </div>

        <div className="backdrop-blur-xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-blue-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow duration-300">
          <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-300 mx-auto mb-2" />
          <span className="text-lg sm:text-2xl font-semibold text-white">{pedidosHoy}</span>
          <p className="text-blue-300 text-[10px] sm:text-xs">Pedidos Hoy</p>
        </div>

        <div className="backdrop-blur-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/20 border border-cyan-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-shadow duration-300">
          <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-300 mx-auto mb-2" />
          <span className="text-lg sm:text-2xl font-semibold text-white">{pedidosMes}</span>
          <p className="text-cyan-300 text-[10px] sm:text-xs">Pedidos Mes</p>
        </div>

        <div className="backdrop-blur-xl bg-gradient-to-br from-teal-500/20 to-teal-700/20 border border-teal-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-shadow duration-300">
          <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-teal-300 mx-auto mb-2" />
          <span className="text-lg sm:text-2xl font-semibold text-white">{totalStats.totalPedidos}</span>
          <p className="text-teal-300 text-[10px] sm:text-xs">Pedidos Totales</p>
        </div>

        <div className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/20 border border-emerald-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-shadow duration-300">
          <Users className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300 mx-auto mb-2" />
          <span className="text-lg sm:text-2xl font-semibold text-white">{totalStats.totalClientes}</span>
          <p className="text-emerald-300 text-[10px] sm:text-xs">Clientes</p>
        </div>

        <div className="backdrop-blur-xl bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-400/30 rounded-xl px-3 sm:px-4 py-3 text-center hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-shadow duration-300">
          <Package className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 mx-auto mb-2" />
          <span className="text-lg sm:text-2xl font-semibold text-white">{totalStats.totalProductos}</span>
          <p className="text-amber-300 text-[10px] sm:text-xs">Productos</p>
        </div>
      </div>

      {totalStats.pedidosPendientes > 0 && (
        <div className="backdrop-blur-xl bg-amber-500/20 border border-amber-400/30 rounded-xl p-4 flex items-center gap-3" role="alert">
          <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" aria-hidden="true" />
          <p className="text-amber-200">
            Hay <strong className="text-white">{totalStats.pedidosPendientes}</strong> pedidos pendientes en todas las empresas
          </p>
        </div>
      )}

      {ranking.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ranking Card */}
          <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">Ranking de Empresas</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">Top 10 empresas por pedidos este mes</p>
            <div className="space-y-3">
              {ranking.slice(0, 10).map((emp) => (
                <div key={emp.empresaId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getPositionClasses(emp.posicion)}`}>
                    {emp.posicion}
                  </div>
                  {emp.empresaLogoUrl ? (
                    <Image
                      src={emp.empresaLogoUrl}
                      alt={emp.empresaNombre}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-lg object-contain bg-white/10 border border-white/20"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-white/70" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{emp.empresaNombre}</p>
                    <p className="text-xs text-slate-400 truncate">{emp.empresaDominio}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-white">{emp.pedidosMes}</p>
                    <p className="text-xs text-slate-400">pedidos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pedidos Chart Card */}
          <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Pedidos del Mes</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">Desglose por empresa</p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {ranking.map((emp) => (
                <div key={emp.empresaId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-cyan-400" aria-hidden="true"></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{emp.empresaNombre}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-white">{emp.pedidosMes}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empresas Table */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-4">Empresas</h3>

        {fetchError ? (
          <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-6 text-center">
            <p className="text-red-400">Error al cargar: {fetchError}</p>
          </div>
        ) : (
          <EmpresasTable
            empresas={empresas.map(e => ({
              id: e.id,
              nombre: e.nombre,
              dominio: e.dominio,
              logoUrl: e.logoUrl,
              mostrarPromociones: e.mostrarPromociones,
              mostrarTgtg: e.mostrarTgtg,
              stats: e.stats,
            }))}
          />
        )}
      </div>
    </div>
  );
}
