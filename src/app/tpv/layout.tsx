import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  getAuthAdminUseCase,
  getProductUseCase,
  getCategoryUseCase,
  getMesaSesionUseCase,
  getComplementoGrupoRepository,
} from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { TpvHeader } from '@/components/tpv/TpvHeader';
import { TpvRolProvider } from '@/lib/tpv-rol-ctx';
import { TpvCatalogProvider } from '@/lib/tpv-catalog-ctx';
import { TpvAccionesProvider } from '@/lib/tpv-acciones-ctx';
import { AccionesPanel } from '@/components/tpv/AccionesActions';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';
import { TpvSwRegistrar } from '@/components/tpv-sw-registrar';

const VALID_ROLES = new Set<RolAdmin>(['superadmin', 'admin', 'encargado', 'cajero']);

// Rutas donde no se requiere un turno activo
const TURNO_OPTIONAL_PREFIXES = [
  '/tpv/turno',
  '/tpv/historial',
  '/tpv/analytics',
  '/tpv/mermas',
];

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Multisistema TPV',
  robots: { index: false, follow: false },
};

export default async function TpvLayout({ children }: { readonly children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  if (pathname === '/tpv/login') {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  let rol: RolAdmin | null = null;
  let empresaNombre = '';
  let empresaId: string | null = null;
  let isEmployeeSession = false;

  // 1. Try admin_token first
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin && VALID_ROLES.has(admin.rol)) {
      rol = admin.rol;
      empresaNombre = admin.empresa?.nombre ?? '';
      empresaId = admin.empresaId ?? admin.empresa?.id ?? null;
    }
  }

  // 2. Fallback to tpv_employee_token
  if (!rol) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (employeeToken) {
      const payload = await verifyTpvEmployeeToken(employeeToken);
      if (payload) {
        rol = payload.rol;
        isEmployeeSession = true;
        empresaId = payload.empresaId;
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('empresas')
          .select('nombre')
          .eq('id', payload.empresaId)
          .maybeSingle();
        empresaNombre = (data as { nombre: string } | null)?.nombre ?? '';
      }
    }
  }

  if (!rol || !empresaId) redirect('/tpv/login');

  // Fetch all catalog data in parallel — runs once per layout lifetime (not on tab navigation)
  const repo = new SupabaseTpvRepository();
  const supabase = getSupabaseClient();

  const [productsResult, categoriesResult, mesasResult, turnoResult, empresaRes, gruposResult] = await Promise.all([
    getProductUseCase().getAll(empresaId),
    getCategoryUseCase().getAll(empresaId),
    getMesaSesionUseCase().getMesasWithSessions(empresaId),
    repo.findTurnoActivo(empresaId),
    supabase
      .from('empresas')
      .select('tipo_impuesto, porcentaje_impuesto')
      .eq('id', empresaId)
      .maybeSingle(),
    getComplementoGrupoRepository().findAllByTenant(empresaId),
  ]);

  // Redirect to turno/abrir if no active turno — skip for pages that don't need one
  const requiresTurno = !TURNO_OPTIONAL_PREFIXES.some(p => pathname.startsWith(p));
  if (requiresTurno && (!turnoResult.success || turnoResult.data === null)) {
    // Cajeros cannot open a turno — redirecting them to /turno/abrir creates an infinite loop.
    // Send them to /tpv/turno/espera so they can wait for an encargado.
    if (rol === 'cajero') redirect('/tpv/turno/espera');
    else redirect('/tpv/turno/abrir');
  }

  const products = productsResult.success ? productsResult.data : [];
  const categories = categoriesResult.success ? categoriesResult.data : [];
  const mesas = mesasResult.success ? mesasResult.data : [];
  const turno = turnoResult.success ? turnoResult.data : null;
  const complementoGrupos = gruposResult.success ? gruposResult.data : [];

  const activeProductIds = products.filter(p => p.activo).map(p => p.id);
  const assignmentsResult = await getComplementoGrupoRepository().findAssignmentsByProductos(activeProductIds, empresaId);
  const productoGrupos = assignmentsResult.success ? assignmentsResult.data : [];

  const empresaRow = empresaRes.data as { tipo_impuesto: string | null; porcentaje_impuesto: number | null } | null;
  const tipoImpuesto = (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';
  const porcentajeImpuesto = empresaRow?.porcentaje_impuesto ?? 10;

  return (
    <TpvRolProvider rol={rol} isEmployeeSession={isEmployeeSession}>
      <TpvCatalogProvider
        initialProducts={products}
        initialCategories={categories}
        tipoImpuesto={tipoImpuesto}
        porcentajeImpuesto={porcentajeImpuesto}
        initialTurno={turno}
        initialMesas={mesas}
        empresaId={empresaId}
        initialComplementoGrupos={complementoGrupos}
        initialProductoGrupos={productoGrupos}
      >
        <TpvAccionesProvider>
          <TpvSwRegistrar />
          <div className="flex flex-col h-screen bg-[#f1f5f9] text-[#0f172a] overflow-hidden">
            <TpvHeader empresaNombre={empresaNombre} />
            <main className="flex flex-1 overflow-hidden">
              {children}
              <AccionesPanel />
            </main>
          </div>
        </TpvAccionesProvider>
      </TpvCatalogProvider>
    </TpvRolProvider>
  );
}
