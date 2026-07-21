'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

interface AccionesCtxValue {
  sesionId: string | null;
  refreshing: boolean;
  hasPendingItems: boolean;
  triggerRefresh: () => void;
  registerRefresh: (sesionId: string | null, fn: (() => Promise<void>) | null) => void;
  setHasPendingItems: (v: boolean) => void;
}

const AccionesCtx = createContext<AccionesCtxValue>({
  sesionId: null,
  refreshing: false,
  hasPendingItems: false,
  triggerRefresh: () => undefined,
  registerRefresh: () => undefined,
  setHasPendingItems: () => undefined,
});

export function TpvAccionesProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasPendingItems, setHasPendingItems] = useState(false);
  const fnRef = useRef<(() => Promise<void>) | null>(null);

  const registerRefresh = useCallback((id: string | null, fn: (() => Promise<void>) | null) => {
    setSesionId(id);
    fnRef.current = fn;
  }, []);

  const triggerRefresh = useCallback(() => {
    if (!fnRef.current) return;
    setRefreshing(true);
    void fnRef.current().finally(() => setRefreshing(false));
  }, []);

  return (
    <AccionesCtx.Provider value={{ sesionId, refreshing, hasPendingItems, setHasPendingItems, triggerRefresh, registerRefresh }}>
      {children}
    </AccionesCtx.Provider>
  );
}

export const useTpvAcciones = () => useContext(AccionesCtx);
