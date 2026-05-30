import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { getDeliverySettingsUseCase } from '@/core/application/use-cases/delivery/getDeliverySettingsUseCase';
import { DeliveryCredentialsForm } from '@/components/admin/delivery/DeliveryCredentialsForm';
import { Settings } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);
  if (!admin) redirect('/admin/login');

  let empresaId = admin.empresaId;
  if (admin.rol === SUPERADMIN_ROLE) {
    const superadminEmpresaId = cookieStore.get('superadmin_empresa_id')?.value;
    if (!superadminEmpresaId) redirect('/superadmin');
    empresaId = superadminEmpresaId;
  }

  const settingsResult = await getDeliverySettingsUseCase(empresaId!);

  const initialSettings = settingsResult.success && settingsResult.data ? settingsResult.data : {
    delivery_min_order_cents: 0,
    delivery_fee_surcharge_cents: 0,
    glovo_client_id: '',
    glovo_key_id: '',
    glovo_vendor_id: '',
    glovo_country_code: 'es',
    glovo_private_key_set: false,
    redsys_merchant_code: '',
    redsys_terminal: '001',
    redsys_secret_key_set: false,
  };

  return (
    <div className="p-6 max-w-2xl space-y-10">
      {/* Credentials section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-bold text-white">Integración de entrega</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Credenciales de Glovo Business y Redsys TPV Virtual
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <DeliveryCredentialsForm initial={initialSettings} />
        </div>
      </section>
    </div>
  );
}
