import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { TpvHeader } from '@/components/tpv/TpvHeader';

export const dynamic = 'force-dynamic';

export default async function TpvLayout({ children }: { readonly children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">
      <TpvHeader empresaNombre={admin.empresa?.nombre ?? ''} />
      <main className="flex flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
