import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  getProductUseCase,
  getCategoryUseCase,
  getMesaSesionUseCase,
  getComplementoGrupoRepository,
} from '@/core/infrastructure/database';
import { resolverSesionTpv } from '@/lib/tpv/sesion-servidor';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { TpvHeader } from '@/components/tpv/TpvHeader';
import { TpvRolProvider } from '@/lib/tpv-rol-ctx';
import { TpvCatalogProvider } from '@/lib/tpv-catalog-ctx';
import { TpvAccionesProvider } from '@/lib/tpv-acciones-ctx';
import { AccionesPanel } from '@/components/tpv/AccionesActions';
import { TpvSwRegistrar } from '@/components/tpv-sw-registrar';

// Rutas donde no se requiere un turno activo
const TURNO_OPTIONAL_PREFIXES = [
  '/tpv/turno',
  '/tpv/historial',
  '/tpv/analytics',
  '/tpv/mermas',
  '/tpv/jornada',
];

/** Solo hace falta en sesión de empleado: el admin trae el nombre en el token. */
async function nombreDeEmpresa(empresaId: string): Promise<string> {
  const { data } = await getSupabaseClient()
    .from('empresas')
    .select('nombre')
    .eq('id', empresaId)
    .maybeSingle();
  return (data as { nombre: string } | null)?.nombre ?? '';
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Multisistema TPV',
  robots: { index: false, follow: false },
};

export default async function TpvLayout({ children }: { readonly children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  // /tpv/legal es pública — inspectores de Hacienda acceden sin credenciales (Art. 12 RD 1007/2023)
  const FRAMELESS_PATHS = ['/tpv/login', '/tpv/turno/abrir', '/tpv/turno/espera', '/tpv/audit/inspector', '/tpv/legal'];
  if (FRAMELESS_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  const sesion = await resolverSesionTpv(cookieStore);
  if (!sesion) redirect('/tpv/login');

  const { rol, empresaId, esEmpleado: isEmployeeSession } = sesion;
  // El nombre solo llega gratis con el token de admin; en sesión de empleado hay
  // que buscarlo, y esta pantalla sí lo pinta en la cabecera.
  const empresaNombre = sesion.empresaNombre ?? await nombreDeEmpresa(empresaId);

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
