import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { TpvLoginForm } from '@/components/tpv/TpvLoginForm';

export async function TpvLoginContent() {
  const cookieStore = await cookies();

  // Auto-forward encargados who are already authenticated.
  // Admins access the TPV directly — they don't go through /tpv/login.
  // Cajeros are NOT forwarded here: they can't open turnos and would enter
  // an infinite redirect loop between /turno/abrir and /mostrador.
  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (employeeToken) {
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (payload && payload.rol !== 'cajero') redirect('/tpv/turno/abrir');
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
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-12 flex flex-col gap-8 w-full max-w-sm shadow-sm">
        <div className="flex flex-col gap-2 items-center text-center">
          <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">TPV</span>
          <h1 className="text-2xl font-bold text-[#0f172a]">
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
