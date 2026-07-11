import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  authAdminUseCase,
  productUseCase,
  categoryUseCase,
  mesaSesionUseCase,
} from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { TpvHeader } from '@/components/tpv/TpvHeader';
import { TpvRolProvider } from '@/lib/tpv-rol-ctx';
import { TpvCatalogProvider } from '@/lib/tpv-catalog-ctx';
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
    const admin = await authAdminUseCase.verifyToken(adminToken);
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

  const [productsResult, categoriesResult, mesasResult, turnoResult, empresaRes] = await Promise.all([
    productUseCase.getAll(empresaId),
    categoryUseCase.getAll(empresaId),
    mesaSesionUseCase.getMesasWithSessions(empresaId),
    repo.findTurnoActivo(empresaId),
    supabase
      .from('empresas')
      .select('tipo_impuesto, porcentaje_impuesto')
      .eq('id', empresaId)
      .maybeSingle(),
  ]);

  // Redirect to turno/abrir if no active turno — skip for pages that don't need one
  const requiresTurno = !TURNO_OPTIONAL_PREFIXES.some(p => pathname.startsWith(p));
  if (requiresTurno && (!turnoResult.success || turnoResult.data === null)) {
    redirect('/tpv/turno/abrir');
  }

  const products = productsResult.success ? productsResult.data : [];
  const categories = categoriesResult.success ? categoriesResult.data : [];
  const mesas = mesasResult.success ? mesasResult.data : [];
  const turno = turnoResult.success ? turnoResult.data : null;

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
      >
        <TpvSwRegistrar />
        <div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">
          <TpvHeader empresaNombre={empresaNombre} />
          <main className="flex flex-1 overflow-hidden">
            {children}
          </main>
        </div>
      </TpvCatalogProvider>
    </TpvRolProvider>
  );
}
