import Link from 'next/link';
import Image from 'next/image';
import { Building2, Users, ShoppingCart, Package, AlertCircle, CheckCircle, TrendingUp, Calendar, Trophy } from 'lucide-react';
import { superAdminUseCase } from '@/core/infrastructure/database';

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
        
        {(() => {
          if (fetchError) {
            return (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
                <p className="text-destructive">Error al cargar: {fetchError}</p>
              </div>
            );
          } else if (empresas.length === 0) {
            return (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No hay empresas registradas</p>
              </div>
            );
          } else {
            return (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]" aria-label="Listado de empresas">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Empresa</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Dominio</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Hoy</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Mes</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Pendientes</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Clientes</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Admins</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {empresas.map((empresa) => (
                      <tr key={empresa.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {empresa.logoUrl ? (
                              <Image
                                src={empresa.logoUrl}
                                alt={empresa.nombre}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-lg object-contain bg-white border border-border"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <span className="font-medium text-foreground">{empresa.nombre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <a
                            href={`https://${empresa.dominio}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            {empresa.dominio}
                          </a>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-sm font-medium text-primary">{empresa.stats.pedidosHoy}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-sm font-medium text-primary">{empresa.stats.pedidosMes}</span>
                        </td>
                        <td className="px-4 py-4 text-center text-foreground">
                          {empresa.stats.totalPedidos}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {empresa.stats.pedidosPendientes > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm">
                              <AlertCircle className="h-3 w-3" aria-hidden="true" />
                              {empresa.stats.pedidosPendientes}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                              <CheckCircle className="h-3 w-3" aria-hidden="true" />
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center text-foreground">
                          {empresa.stats.totalClientes}
                        </td>
                        <td className="px-4 py-4 text-center text-foreground">
                          {empresa.adminCount}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/api/superadmin/switch-empresa?empresaId=${empresa.id}`}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            Editar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            );
          }
        })()}
      </div>
    </div>
  );
}
