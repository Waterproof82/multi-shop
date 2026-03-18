import { cookies } from 'next/headers';
import { authAdminUseCase, pedidoUseCase } from '@/core/infrastructure/database';
import { getMenuUseCase } from '@/lib/server-services';
import Link from 'next/link';
import { ShoppingBag, Users, Package, TrendingUp, ArrowRight, Clock } from 'lucide-react';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import { PEDIDO_ESTADO_LABELS, PEDIDO_ESTADO_COLORS } from '@/core/domain/constants/pedido';
import type { PedidoEstado } from '@/core/domain/constants/pedido';

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return <div>No autorizado</div>;
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    return <div>No autorizado</div>;
  }

  const [menuResult, pedidosResult, statsResult] = await Promise.all([
    getMenuUseCase.execute(admin.empresaId),
    pedidoUseCase.getAll(admin.empresaId),
    pedidoUseCase.getStats(admin.empresaId, new Date().getMonth(), new Date().getFullYear()),
  ]);
  
  // Handle error case
  if (menuResult.error || !menuResult.data) {
    return (
      <div className="pt-16 lg:pt-0 px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Dashboard
        </h1>
        <p className="text-muted-foreground mb-6">
          Gestionando: <strong>{admin.empresa.nombre}</strong>
        </p>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive">Error al cargar el menú: {menuResult.error}</p>
        </div>
      </div>
    );
  }

  const menu: MenuCategoryVM[] = menuResult.data;
  const totalProductos = menu.reduce((sum, cat) => sum + cat.items.length, 0);
  const totalCategorias = menu.length;
  const productosEspeciales = menu.reduce(
    (sum, cat) => sum + cat.items.filter((item) => item.highlight).length,
    0
  );

  const pedidos = pedidosResult.success ? pedidosResult.data || [] : [];
  const stats = statsResult.success ? statsResult.data : null;
  
  // Get recent orders (last 5)
  const recentOrders = [...pedidos]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header con stats */}
      <div className="bg-primary rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary-foreground">Dashboard</h1>
            <p className="text-primary-foreground/80 text-sm mt-1">{admin.empresa.nombre}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{stats?.pedidosHoy || 0}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Pedidos hoy</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{formatCurrency(stats?.totalMes || 0)}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Ventas mes</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{totalProductos}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Productos</p>
            </div>
            <div className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-center">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground mx-auto mb-1" />
              <span className="text-lg sm:text-2xl font-semibold text-primary-foreground">{productosEspeciales}</span>
              <p className="text-primary-foreground/80 text-[10px] sm:text-xs">Destacados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link 
          href="/admin/productos" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Package className="w-4 h-4" />
          Nuevo producto
        </Link>
        <Link 
          href="/admin/pedidos" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm font-medium"
        >
          <ShoppingBag className="w-4 h-4" />
          Ver pedidos
        </Link>
      </div>

      {/* Recent Orders */}
      <div className="bg-card rounded-lg border border-border overflow-hidden mb-6">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Últimos pedidos
          </h2>
          <Link href="/admin/pedidos" className="text-sm text-primary hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        
        {recentOrders.length > 0 ? (
          <div className="divide-y divide-border">
            {recentOrders.map((pedido) => (
              <div key={pedido.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">#{pedido.numero_pedido}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      PEDIDO_ESTADO_COLORS[pedido.estado as PedidoEstado] || 'bg-muted text-muted-foreground'
                    }`}>
                      {PEDIDO_ESTADO_LABELS[pedido.estado as keyof typeof PEDIDO_ESTADO_LABELS] || pedido.estado}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{pedido.clientes?.nombre || 'Cliente'} • {pedido.clientes?.telefono || 'Sin teléfono'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{formatCurrency(pedido.total)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(pedido.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No hay pedidos todavía</p>
          </div>
        )}
      </div>

      {/* Menu Preview */}
      <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Vista Previa del Menú</h2>
        <div className="space-y-3">
          {menu.slice(0, 5).map((categoria) => (
            <div key={categoria.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <h3 className="font-medium text-foreground">{categoria.label}</h3>
                <p className="text-sm text-muted-foreground">{categoria.items.length} productos</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
          {menu.length > 5 && (
            <Link href="/admin/categorias" className="block text-center text-sm text-primary hover:underline pt-2">
              Ver todas las categorías ({menu.length})
            </Link>
          )}
          {menu.length === 0 && (
            <p className="text-muted-foreground text-center py-4">
              No hay categorías configuradas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
