'use client';

import { createContext, useContext, ReactNode } from 'react';

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
  children: ReactNode;
  empresaId: string;
  empresaNombre: string;
}

export function AdminProvider({ children, empresaId, empresaNombre }: AdminProviderProps) {
  // Generar slug del nombre de empresa
  const empresaSlug = empresaNombre
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || empresaId.slice(0, 8);

  return (
    <AdminContext.Provider value={{ empresaId, empresaSlug }}>
      {children}
    </AdminContext.Provider>
  );
}
