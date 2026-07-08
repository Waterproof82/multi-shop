'use client';

import { createContext, useContext } from 'react';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

interface TpvRolContextValue {
  rol: RolAdmin;
  isEmployeeSession: boolean;
}

const TpvRolContext = createContext<TpvRolContextValue>({ rol: 'cajero', isEmployeeSession: false });

export function TpvRolProvider({
  children,
  rol,
  isEmployeeSession,
}: Readonly<{ children: React.ReactNode; rol: RolAdmin; isEmployeeSession: boolean }>) {
  return <TpvRolContext.Provider value={{ rol, isEmployeeSession }}>{children}</TpvRolContext.Provider>;
}

export function useTpvRol(): RolAdmin {
  return useContext(TpvRolContext).rol;
}

export function useTpvIsEmployeeSession(): boolean {
  return useContext(TpvRolContext).isEmployeeSession;
}
