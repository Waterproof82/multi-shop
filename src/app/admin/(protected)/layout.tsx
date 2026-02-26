import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { AdminSidebar } from './admin-sidebar';
import { AdminProvider } from '@/lib/admin-context';
import { adminRepository } from '@/core/infrastructure/database/SupabaseAdminRepository';
import { AdminThemeProvider } from '@/components/admin-theme-provider';
import { EmpresaThemeProvider } from '@/components/empresa-theme-provider';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

async function verifyAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifyAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  // Obtener datos de la empresa completos
  const admin = await adminRepository.findById(session.adminId as string);
  const empresa = admin?.empresa;
  const empresaNombre = empresa?.nombre || 'default';
  const empresaId = session.empresaId as string || '';

  return (
    <AdminThemeProvider>
      <EmpresaThemeProvider colores={empresa?.colores || null}>
        <AdminProvider empresaId={empresaId} empresaNombre={empresaNombre}>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <AdminSidebar session={session} />
            <main className="lg:ml-64 min-h-screen">
              {children}
            </main>
          </div>
        </AdminProvider>
      </EmpresaThemeProvider>
    </AdminThemeProvider>
  );
}
