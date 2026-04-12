'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';

interface AdminContextType {
  empresaId: string;
  empresaSlug: string;
  empresaLogo: string | null;
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
  overrideEmpresaId?: string;
  isSuperAdmin: boolean;
}

const AdminContext = createContext<AdminContextType>({
  empresaId: '',
  empresaSlug: 'default',
  empresaLogo: null,
  mostrarPromociones: true,
  mostrarTgtg: true,
  isSuperAdmin: false,
});

export function useAdmin() {
  return useContext(AdminContext);
}

interface AdminProviderProps {
  readonly children: ReactNode;
  readonly empresaId: string;
  readonly empresaNombre: string;
  readonly empresaLogo?: string | null;
  readonly mostrarPromociones: boolean;
  readonly mostrarTgtg: boolean;
  readonly overrideEmpresaId?: string;
  readonly isSuperAdmin: boolean;
}

export function AdminProvider({ children, empresaId, empresaNombre, empresaLogo, mostrarPromociones, mostrarTgtg, overrideEmpresaId, isSuperAdmin }: Readonly<AdminProviderProps>) {
  const empresaSlug = empresaNombre
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || empresaId.slice(0, 8);

  const effectiveEmpresaId = overrideEmpresaId || empresaId;

  const value = useMemo(() => ({
    empresaId: effectiveEmpresaId,
    empresaSlug,
    empresaLogo: empresaLogo || null,
    mostrarPromociones,
    mostrarTgtg,
    overrideEmpresaId,
    isSuperAdmin
  }), [effectiveEmpresaId, empresaSlug, empresaLogo, mostrarPromociones, mostrarTgtg, overrideEmpresaId, isSuperAdmin]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}
