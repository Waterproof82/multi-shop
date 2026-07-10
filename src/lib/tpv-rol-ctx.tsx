'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

interface TpvRolContextValue {
  rol: RolAdmin;
  isEmployeeSession: boolean;
}

const TpvRolContext = createContext<TpvRolContextValue>({ rol: 'cajero', isEmployeeSession: false });

export function TpvRolProvider({
  children,
  rol: initialRol,
  isEmployeeSession: initialIsEmployeeSession,
}: Readonly<{ children: React.ReactNode; rol: RolAdmin; isEmployeeSession: boolean }>) {
  const [value, setValue] = useState<TpvRolContextValue>({ rol: initialRol, isEmployeeSession: initialIsEmployeeSession });

  useEffect(() => {
    // Listen for PIN login/switch events to update role without needing a full page reload.
    // Dispatched by TpvLoginForm and TpvPinCard before navigating after a successful login.
    function handleAuthChanged(e: Event) {
      const { rol, isEmployeeSession } = (e as CustomEvent<{ rol: RolAdmin; isEmployeeSession: boolean }>).detail;
      setValue({ rol, isEmployeeSession });
    }
    window.addEventListener('tpv-auth-changed', handleAuthChanged);
    return () => window.removeEventListener('tpv-auth-changed', handleAuthChanged);
  }, []);

  return <TpvRolContext.Provider value={value}>{children}</TpvRolContext.Provider>;
}

export function useTpvRol(): RolAdmin {
  return useContext(TpvRolContext).rol;
}

export function useTpvIsEmployeeSession(): boolean {
  return useContext(TpvRolContext).isEmployeeSession;
}
