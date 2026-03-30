import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { AdminThemeProvider } from '@/components/admin-theme-provider';
import SuperAdminHeader from './super-admin-header';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SuperAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    redirect('/admin/login');
  }

  if (admin.rol !== 'superadmin') {
    redirect('/admin');
  }

  return (
    <AdminThemeProvider>
      <div className="min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Ir al contenido principal
        </a>
        <SuperAdminHeader adminName={admin.nombreCompleto || 'Super Admin'} />
        <main id="main-content" className="container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </AdminThemeProvider>
  );
}
