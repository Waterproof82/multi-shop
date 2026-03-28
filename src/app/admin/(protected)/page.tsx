import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authAdminUseCase, pedidoUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { getMenuUseCase } from '@/lib/server-services';
import { AdminDashboardClient } from '@/components/admin/admin-dashboard-client';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import type { DashboardPedido, DashboardStats } from '@/components/admin/admin-dashboard-client';

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

  let empresaId = admin.empresaId;

  if (admin.rol === SUPERADMIN_ROLE) {
    const superadminEmpresaId = cookieStore.get('superadmin_empresa_id')?.value;
    if (!superadminEmpresaId) {
      redirect('/superadmin');
    }
    empresaId = superadminEmpresaId;
  }

  if (!empresaId) {
    redirect('/admin/login');
  }

  let empresaNombre = admin.empresa?.nombre ?? 'default';
  if (admin.rol === SUPERADMIN_ROLE) {
    const empresaResult = await empresaUseCase.getById(empresaId);
    if (empresaResult.success && empresaResult.data) {
      empresaNombre = empresaResult.data.nombre || 'default';
    }
  }

  const [menuResult, pedidosResult, statsResult] = await Promise.all([
    getMenuUseCase.execute(empresaId),
    pedidoUseCase.getAll(empresaId),
    pedidoUseCase.getStats(empresaId, new Date().getMonth(), new Date().getFullYear()),
  ]);

  const menu: MenuCategoryVM[] = menuResult.data || [];
  const menuError = menuResult.error || undefined;

  const pedidos: DashboardPedido[] = pedidosResult.success ? (pedidosResult.data || []) as DashboardPedido[] : [];
  const stats: DashboardStats | null = statsResult.success ? statsResult.data as DashboardStats : null;

  return (
    <AdminDashboardClient
      empresaNombre={empresaNombre}
      menu={menu}
      pedidos={pedidos}
      stats={stats}
      menuError={menuError}
    />
  );
}
