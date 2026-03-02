'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';

interface AdminContextType {
  empresaId: string;
  empresaSlug: string;
}

const AdminContext = createContext<AdminContextType>({
  empresaId: '',
  empresaSlug: 'default',
});

export function useAdmin() {
  return useContext(AdminContext);
}

interface AdminProviderProps {
  readonly children: ReactNode;
  readonly empresaId: string;
  readonly empresaNombre: string;
}

export function AdminProvider({ children, empresaId, empresaNombre }: Readonly<AdminProviderProps>) {
  // Generar slug del nombre de empresa
  const empresaSlug = empresaNombre
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || empresaId.slice(0, 8);

  const value = useMemo(() => ({ empresaId, empresaSlug }), [empresaId, empresaSlug]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}
