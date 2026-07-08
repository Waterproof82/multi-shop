import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { TpvLoginForm } from '@/components/tpv/TpvLoginForm';

export const dynamic = 'force-dynamic';

export default async function TpvLoginPage() {
  const cookieStore = await cookies();

  // Already authenticated? Forward to turno/abrir
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin) redirect('/tpv/turno/abrir');
  }

  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (employeeToken) {
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (payload) redirect('/tpv/turno/abrir');
  }

  // Get empresa name from domain for display
  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);
  const supabase = getSupabaseClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('dominio', mainDomain)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-full max-w-sm">
        <div className="flex flex-col gap-2 items-center text-center">
          <span className="text-xs font-bold text-[#4f72ff] uppercase tracking-wider">TPV</span>
          <h1 className="text-2xl font-bold text-[#e8eaf0]">
            {(empresa as { nombre: string } | null)?.nombre ?? 'Acceso TPV'}
          </h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            Introduce tu PIN para continuar
          </p>
        </div>
        <TpvLoginForm />
      </div>
    </div>
  );
}
