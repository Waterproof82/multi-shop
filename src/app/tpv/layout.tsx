import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { TpvHeader } from '@/components/tpv/TpvHeader';
import { TpvRolProvider } from '@/lib/tpv-rol-context';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

const VALID_ROLES: RolAdmin[] = ['superadmin', 'admin', 'encargado', 'cajero'];

export const dynamic = 'force-dynamic';

export default async function TpvLayout({ children }: { readonly children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');

  if (!VALID_ROLES.includes(admin.rol)) redirect('/admin/login');

  return (
    <TpvRolProvider rol={admin.rol}>
      <div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">
        <TpvHeader empresaNombre={admin.empresa?.nombre ?? ''} />
        <main className="flex flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </TpvRolProvider>
  );
}
