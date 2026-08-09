import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthAdminUseCase, getPedidoUseCase, getEmpresaUseCase, getTgtgUseCase, getPromocionUseCase } from '@/core/infrastructure/database';
import { getMenuUseCase } from '@/lib/server-services';
import { AdminDashboardClient } from '@/components/admin/admin-dashboard-client';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import type { DashboardPedido, DashboardStats, DashboardPromoSummary, DashboardTgtgSummary } from '@/components/admin/admin-dashboard-client';
import type { TgtgWithItems } from '@/core/application/use-cases/tgtg.use-case';
import { ScrollOnMount } from '@/components/scroll-on-mount';

export const dynamic = 'force-dynamic';

/** Holgura sobre los 5 que se pintan: `findAllByTenant` descarta después los
 *  pedidos de sesiones de mesa aún abiertas, así que pedir justo 5 podría
 *  dejar la lista corta. */
const DASHBOARD_RECENT_PEDIDOS_LIMIT = 50;

interface ConfigEmpresa {
  nombre: string;
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
}

/** Lo que hace falta del admin autenticado, sin atarse a la forma completa. */
interface AdminMinimo {
  rol: string;
  empresa?: { nombre?: string; mostrarPromociones?: boolean; mostrarTgtg?: boolean } | null;
}

/**
 * Configuración visible de la empresa.
 *
 * Normalmente viene dentro del token y no hay que consultar nada. Dos
 * excepciones obligan a ir a base de datos:
 *
 * - El **superadmin** entra "como" otra empresa (cookie `superadmin_empresa_id`),
 *   así que la empresa de su token NO es la que está mirando.
 * - Un admin cuyo token no trajo la empresa cargada.
 *
 * Los valores por defecto son PERMISIVOS (`true`): si no se puede leer la
 * configuración, se muestran las secciones. Ocultarlas ante un fallo de lectura
 * haría creer al dueño que perdió funcionalidad que sigue contratada.
 */
async function configDeEmpresa(admin: AdminMinimo, empresaId: string): Promise<ConfigEmpresa> {
  const delToken: ConfigEmpresa = {
    nombre: admin.empresa?.nombre ?? 'default',
    mostrarPromociones: admin.empresa?.mostrarPromociones ?? true,
    mostrarTgtg: admin.empresa?.mostrarTgtg ?? true,
  };

  if (admin.rol !== SUPERADMIN_ROLE && admin.empresa) return delToken;

  const resultado = await getEmpresaUseCase().getById(empresaId);
  if (!resultado.success || !resultado.data) return delToken;

  return {
    nombre: resultado.data.nombre || 'default',
    mostrarPromociones: resultado.data.mostrarPromociones ?? true,
    mostrarTgtg: resultado.data.mostrarTgtg ?? true,
  };
}

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await getAuthAdminUseCase().verifyToken(token);

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

  const { nombre: empresaNombre, mostrarPromociones, mostrarTgtg } =
    await configDeEmpresa(admin, empresaId);

  const emptyPromos: { success: true; data: { fecha_hora: string; numero_envios: number }[] } = { success: true, data: [] };
  const emptyTgtg: { success: true; data: TgtgWithItems[] } = { success: true, data: [] };

  const [menuResult, pedidosResult, statsResult, promosResult, tgtgResult] = await Promise.all([
    getMenuUseCase().execute(empresaId),
    // El dashboard solo renderiza los 5 pedidos más recientes (ver
    // `recentOrders` en admin-dashboard-client). Traer el histórico completo
    // aquí hacía crecer esta carga con cada pedido acumulado del negocio.
    // El margen sobre 5 cubre el filtrado posterior de sesiones abiertas.
    getPedidoUseCase().getAll(empresaId, DASHBOARD_RECENT_PEDIDOS_LIMIT),
    getPedidoUseCase().getStats(empresaId, new Date().getMonth(), new Date().getFullYear()),
    mostrarPromociones ? getPromocionUseCase().getAll(empresaId) : Promise.resolve(emptyPromos),
    mostrarTgtg ? getTgtgUseCase().getAllRecent(empresaId) : Promise.resolve(emptyTgtg),
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
    <>
      <ScrollOnMount />
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
    </>
  );
}
