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
  adminCount: number;
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
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Resumen General</h2>
        <p className="text-muted-foreground mt-1">Estado de todas las empresas</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Empresas</p>
              <p className="text-2xl font-bold text-foreground">{empresas.length}</p>
            </div>
            <Building2 className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Pedidos Hoy</p>
              <p className="text-2xl font-bold text-foreground">{pedidosHoy}</p>
            </div>
            <Calendar className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Pedidos Mes</p>
              <p className="text-2xl font-bold text-foreground">{pedidosMes}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Pedidos Totales</p>
              <p className="text-2xl font-bold text-foreground">{totalStats.totalPedidos}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Clientes</p>
              <p className="text-2xl font-bold text-foreground">{totalStats.totalClientes}</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Productos</p>
              <p className="text-2xl font-bold text-foreground">{totalStats.totalProductos}</p>
            </div>
            <Package className="h-8 w-8 text-primary" />
          </div>
        </div>
      </div>

      {totalStats.pedidosPendientes > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3" role="alert">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
          <p className="text-amber-800 dark:text-amber-200">
            Hay <strong>{totalStats.pedidosPendientes}</strong> pedidos pendientes en todas las empresas
          </p>
        </div>
      )}

      {ranking.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
              <h3 className="text-lg font-semibold text-foreground">Ranking de Empresas</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Top 10 empresas por pedidos este mes</p>
            <div className="space-y-3">
              {ranking.slice(0, 10).map((emp) => (
                <div key={emp.empresaId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getPositionClasses(emp.posicion)}`}>
                    {emp.posicion}
                  </div>
                  {emp.empresaLogoUrl ? (
                    <Image
                      src={emp.empresaLogoUrl}
                      alt={emp.empresaNombre}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-lg object-contain bg-white border border-border"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{emp.empresaNombre}</p>
                    <p className="text-xs text-muted-foreground truncate">{emp.empresaDominio}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{emp.pedidosMes}</p>
                    <p className="text-xs text-muted-foreground">pedidos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Pedidos del Mes</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Desglose por empresa</p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {ranking.map((emp) => (
                <div key={emp.empresaId} className="flex items-center gap-3 p-2">
                  <div className="w-4 h-4 rounded-full bg-primary" aria-hidden="true"></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{emp.empresaNombre}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{emp.pedidosMes}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Empresas</h3>

        {fetchError ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <p className="text-destructive">Error al cargar: {fetchError}</p>
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
              adminCount: e.adminCount,
            }))}
          />
        )}
      </div>
    </div>
  );
}
