import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { AdminSidebar } from './admin-sidebar';

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

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminSidebar session={session} />
      <main className="lg:ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}
