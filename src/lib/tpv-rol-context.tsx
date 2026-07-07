'use client';

import { createContext, useContext } from 'react';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

const TpvRolContext = createContext<RolAdmin>('cajero');

export function TpvRolProvider({
  children,
  rol,
}: Readonly<{ children: React.ReactNode; rol: RolAdmin }>) {
  return <TpvRolContext.Provider value={rol}>{children}</TpvRolContext.Provider>;
}

export function useTpvRol(): RolAdmin {
  return useContext(TpvRolContext);
}
