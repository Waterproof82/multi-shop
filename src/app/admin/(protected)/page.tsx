import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authAdminUseCase, pedidoUseCase, empresaUseCase, tgtgUseCase, promocionUseCase } from '@/core/infrastructure/database';
import { getMenuUseCase } from '@/lib/server-services';
import { AdminDashboardClient } from '@/components/admin/admin-dashboard-client';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import type { DashboardPedido, DashboardStats, DashboardPromoSummary, DashboardTgtgSummary } from '@/components/admin/admin-dashboard-client';
import type { TgtgWithItems } from '@/core/application/use-cases/tgtg.use-case';

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
  let mostrarPromociones = admin.empresa?.mostrarPromociones ?? true;
  let mostrarTgtg = admin.empresa?.mostrarTgtg ?? true;

  if (admin.rol === SUPERADMIN_ROLE || !admin.empresa) {
    const empresaResult = await empresaUseCase.getById(empresaId);
    if (empresaResult.success && empresaResult.data) {
      empresaNombre = empresaResult.data.nombre || 'default';
      mostrarPromociones = empresaResult.data.mostrarPromociones ?? true;
      mostrarTgtg = empresaResult.data.mostrarTgtg ?? true;
    }
  }

  const emptyPromos: { success: true; data: { fecha_hora: string; numero_envios: number }[] } = { success: true, data: [] };
  const emptyTgtg: { success: true; data: TgtgWithItems[] } = { success: true, data: [] };

  const [menuResult, pedidosResult, statsResult, promosResult, tgtgResult] = await Promise.all([
    getMenuUseCase.execute(empresaId),
    pedidoUseCase.getAll(empresaId),
    pedidoUseCase.getStats(empresaId, new Date().getMonth(), new Date().getFullYear()),
    mostrarPromociones ? promocionUseCase.getAll(empresaId) : Promise.resolve(emptyPromos),
    mostrarTgtg ? tgtgUseCase.getAllRecent(empresaId) : Promise.resolve(emptyTgtg),
  ]);

  const menu: MenuCategoryVM[] = menuResult.data || [];
  const menuError = menuResult.error || undefined;

  const pedidos: DashboardPedido[] = pedidosResult.success ? (pedidosResult.data || []) as DashboardPedido[] : [];
  const stats: DashboardStats | null = statsResult.success ? statsResult.data as DashboardStats : null;

  const promos = promosResult.success ? promosResult.data : [];
  const sortedPromos = [...promos].sort((a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime());
  const promoSummary: DashboardPromoSummary = {
    total: promos.length,
    lastDate: sortedPromos[0]?.fecha_hora ?? null,
    totalEmails: promos.reduce((acc, p) => acc + p.numero_envios, 0),
  };

  const tgtgCampaigns = tgtgResult.success ? tgtgResult.data : [];
  const nowTs = new Date();
  const tgtgSummary: DashboardTgtgSummary = {
    activeCampaigns: tgtgCampaigns.filter(({ promo, items }) => {
      const horaFin = promo.horaRecogidaFin.length === 5 ? `${promo.horaRecogidaFin}:00` : promo.horaRecogidaFin;
      const end = new Date(`${promo.fechaActivacion}T${horaFin}`);
      return !isNaN(end.getTime()) && nowTs <= end && items.some(i => i.cuponesDisponibles > 0);
    }).length,
    sentCampaigns: tgtgCampaigns.filter(({ promo }) => promo.emailEnviado).length,
    claimedCoupons: tgtgCampaigns.reduce((acc, { items }) =>
      acc + items.reduce((a, i) => a + (i.cuponesTotal - i.cuponesDisponibles), 0), 0),
  };

  return (
    <AdminDashboardClient
      empresaNombre={empresaNombre}
      menu={menu}
      pedidos={pedidos}
      stats={stats}
      menuError={menuError}
      promoSummary={promoSummary}
      tgtgSummary={tgtgSummary}
      mostrarPromociones={mostrarPromociones}
      mostrarTgtg={mostrarTgtg}
    />
  );
}
