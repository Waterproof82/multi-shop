'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';

interface AdminContextType {
  empresaId: string;
  empresaSlug: string;
  empresaLogo: string | null;
  empresaTipo: 'tienda' | 'restaurante';
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
  mesasHabilitadas: boolean;
  deliveryHabilitado: boolean;
  overrideEmpresaId?: string;
  isSuperAdmin: boolean;
}

const AdminContext = createContext<AdminContextType>({
  empresaId: '',
  empresaSlug: 'default',
  empresaLogo: null,
  empresaTipo: 'tienda',
  mostrarPromociones: true,
  mostrarTgtg: true,
  mesasHabilitadas: true,
  deliveryHabilitado: false,
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
  readonly empresaTipo: 'tienda' | 'restaurante';
  readonly mostrarPromociones: boolean;
  readonly mostrarTgtg: boolean;
  readonly mesasHabilitadas: boolean;
  readonly deliveryHabilitado: boolean;
  readonly overrideEmpresaId?: string;
  readonly isSuperAdmin: boolean;
}

export function AdminProvider({ children, empresaId, empresaNombre, empresaLogo, empresaTipo, mostrarPromociones, mostrarTgtg, mesasHabilitadas, deliveryHabilitado, overrideEmpresaId, isSuperAdmin }: Readonly<AdminProviderProps>) {
  const empresaSlug = empresaNombre
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || empresaId.slice(0, 8);

  const effectiveEmpresaId = overrideEmpresaId || empresaId;

  const value = useMemo(() => ({
    empresaId: effectiveEmpresaId,
    empresaSlug,
    empresaLogo: empresaLogo || null,
    empresaTipo,
    mostrarPromociones,
    mostrarTgtg,
    mesasHabilitadas,
    deliveryHabilitado,
    overrideEmpresaId,
    isSuperAdmin
  }), [effectiveEmpresaId, empresaSlug, empresaLogo, empresaTipo, mostrarPromociones, mostrarTgtg, mesasHabilitadas, deliveryHabilitado, overrideEmpresaId, isSuperAdmin]);

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}
