'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';

interface AdminContextType {
  empresaId: string;
  empresaSlug: string;
  empresaLogo: string | null;
  overrideEmpresaId?: string;
}

const AdminContext = createContext<AdminContextType>({
  empresaId: '',
  empresaSlug: 'default',
  empresaLogo: null,
});

export function useAdmin() {
  return useContext(AdminContext);
}

interface AdminProviderProps {
  readonly children: ReactNode;
  readonly empresaId: string;
  readonly empresaNombre: string;
  readonly empresaLogo?: string | null;
  readonly overrideEmpresaId?: string;
}

export function AdminProvider({ children, empresaId, empresaNombre, empresaLogo, overrideEmpresaId }: Readonly<AdminProviderProps>) {
  const empresaSlug = empresaNombre
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || empresaId.slice(0, 8);

  const effectiveEmpresaId = overrideEmpresaId || empresaId;
  
  const value = useMemo(() => ({ 
    empresaId: effectiveEmpresaId, 
    empresaSlug, 
    empresaLogo: empresaLogo || null,
    overrideEmpresaId 
  }), [effectiveEmpresaId, empresaSlug, empresaLogo, overrideEmpresaId]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}
