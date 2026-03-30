'use client';

import { fetchWithCsrf } from '@/lib/csrf-client';

interface SuperAdminHeaderProps {
  adminName: string;
}

export default function SuperAdminHeader({ adminName }: SuperAdminHeaderProps) {
  const handleLogout = async () => {
    await fetchWithCsrf('/api/admin/logout', { method: 'POST' });
    globalThis.location.href = '/';
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          Super Admin Panel
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {adminName || 'Super Admin'}
          </span>
          <button
            onClick={handleLogout}
            className="min-h-[44px] min-w-[44px] px-3 text-sm text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
