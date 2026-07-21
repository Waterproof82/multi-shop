'use client';

import { Users } from 'lucide-react';
import { useAdmin } from '@/lib/admin-context';
import { EmpleadosTpvPanel } from '@/components/admin/EmpleadosTpvPanel';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

export default function EmpleadosTpvPage() {
  const { empresaId } = useAdmin();
  const { language } = useLanguage();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Users className="w-6 h-6 text-cyan-400" />
          {t('sidebarEmpleadosTpv', language)}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Gestiona los cajeros y encargados que acceden al TPV con PIN.
        </p>
      </div>

      <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
        <EmpleadosTpvPanel empresaId={empresaId ?? ''} />
      </div>
    </div>
  );
}
