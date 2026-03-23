import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authAdminUseCase, pedidoUseCase } from '@/core/infrastructure/database';
import { getMenuUseCase } from '@/lib/server-services';
import { AdminDashboardClient } from '@/components/admin/admin-dashboard-client';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    redirect('/admin/login');
  }

  const empresaId: string = admin.empresaId;

  const [menuResult, pedidosResult, statsResult] = await Promise.all([
    getMenuUseCase.execute(empresaId),
    pedidoUseCase.getAll(empresaId),
    pedidoUseCase.getStats(empresaId, new Date().getMonth(), new Date().getFullYear()),
  ]);

  const menu: MenuCategoryVM[] = menuResult.data || [];
  const menuError = menuResult.error || undefined;
  
  const pedidos = pedidosResult.success ? pedidosResult.data || [] : [];
  const stats = statsResult.success ? statsResult.data : null;

  return (
    <AdminDashboardClient
      empresaNombre={admin.empresa.nombre}
      menu={menu}
      pedidos={pedidos as any}
      stats={stats as any}
      menuError={menuError}
    />
  );
}
