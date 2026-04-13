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
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-white/10 border-b border-white/20">
      <div className="mx-auto px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">
          Super Admin Panel
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-300">
            {adminName || 'Super Admin'}
          </span>
          <button
            onClick={handleLogout}
            className="min-h-[44px] min-w-[44px] px-3 text-sm text-slate-300 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-md"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
