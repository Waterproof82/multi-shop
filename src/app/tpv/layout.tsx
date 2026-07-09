import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { TpvHeader } from '@/components/tpv/TpvHeader';
import { TpvRolProvider } from '@/lib/tpv-rol-ctx';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';
import { TpvSwRegistrar } from '@/components/tpv-sw-registrar';

const VALID_ROLES: RolAdmin[] = ['superadmin', 'admin', 'encargado', 'cajero'];

export const dynamic = 'force-dynamic';

export default async function TpvLayout({ children }: { readonly children: React.ReactNode }) {
  // Skip auth for the public PIN login page
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';
  if (pathname === '/tpv/login') {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  let rol: RolAdmin | null = null;
  let empresaNombre = '';
  let isEmployeeSession = false;

  // 1. Try admin_token first
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin && VALID_ROLES.includes(admin.rol)) {
      rol = admin.rol;
      empresaNombre = admin.empresa?.nombre ?? '';
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
        // Fetch empresa name for the header
        const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
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

  if (!rol) redirect('/tpv/login');

  return (
    <TpvRolProvider rol={rol} isEmployeeSession={isEmployeeSession}>
      <TpvSwRegistrar />
      <div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">
        <TpvHeader empresaNombre={empresaNombre} />
        <main className="flex flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </TpvRolProvider>
  );
}
