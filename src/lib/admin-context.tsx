'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';

interface AdminContextType {
  empresaId: string;
  empresaSlug: string;
  empresaLogo: string | null;
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
}

export function AdminProvider({ children, empresaId, empresaNombre, empresaLogo }: Readonly<AdminProviderProps>) {
  const empresaSlug = empresaNombre
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || empresaId.slice(0, 8);

  const value = useMemo(() => ({ empresaId, empresaSlug, empresaLogo: empresaLogo || null }), [empresaId, empresaSlug, empresaLogo]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}
