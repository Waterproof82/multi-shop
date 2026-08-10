'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';
import type { EmpresaPublic } from '@/core/domain/entities/types';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { isResumeSignal } from '@/lib/waiter/command-queue';

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface WaiterCatalogValue {
  status: CatalogStatus;
  empresa: EmpresaPublic | null;
  menuData: MenuCategoryVM[] | null;
  ensureCatalog: () => void;
  refresh: () => Promise<void>;
}

const WaiterCatalogContext = createContext<WaiterCatalogValue>({
  status: 'idle',
  empresa: null,
  menuData: null,
  ensureCatalog: () => { /* no-op default */ },
  refresh: async () => { /* no-op default */ },
});

type CatalogResponse = { empresa: EmpresaPublic; menuData: MenuCategoryVM[] };

/** Umbral de frescura para el refetch al volver de pantalla apagada. */
const STALE_MS = 5 * 60_000;
const REALTIME_DEBOUNCE_MS = 400;

export function WaiterCatalogProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<CatalogStatus>('idle');
  const [empresa, setEmpresa] = useState<EmpresaPublic | null>(null);
  const [menuData, setMenuData] = useState<MenuCategoryVM[] | null>(null);

  const inflightRef = useRef(false);
  const fetchedAtRef = useRef(0);
  const menuDataRef = useRef<MenuCategoryVM[] | null>(null);
  menuDataRef.current = menuData;

  const instanceId = useId().replaceAll(':', '-');
  const channelName = useRef(`waiter-catalog-${instanceId}`);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setStatus(prev => (prev === 'ready' ? prev : 'loading'));
    try {
      const res = await fetch('/api/waiter/catalog');
      if (res.status === 401 || res.status === 403) {
        // Sesión expirada: limpiar. La redirección a PIN la maneja WaiterBanner.
        setEmpresa(null);
        setMenuData(null);
        setStatus('idle');
        return;
      }
      if (!res.ok) {
        setStatus(menuDataRef.current ? 'ready' : 'error');
        return;
      }
      const json = await res.json() as CatalogResponse;
      setEmpresa(json.empresa);
      setMenuData(json.menuData);
      fetchedAtRef.current = Date.now();
      setStatus('ready');
    } catch {
      // Fallo de red: si hay cache previa se sigue sirviendo; si no, error.
      setStatus(menuDataRef.current ? 'ready' : 'error');
    } finally {
      inflightRef.current = false;
    }
  }, []);

  const ensureCatalog = useCallback(() => {
    if (inflightRef.current || menuDataRef.current) return;
    void refresh();
  }, [refresh]);

  // Invalidación en caliente: cambios de catálogo del admin (86'd, precios).
  // Canal propio con nombre único — no compite con los de WaiterBanner.
  useEffect(() => {
    const empresaId = empresa?.id;
    if (!empresaId) return;

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void refresh(); }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos', filter: `empresa_id=eq.${empresaId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias', filter: `empresa_id=eq.${empresaId}` }, scheduleRefresh)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [empresa?.id, refresh]);

  // Con pantalla apagada los timers se congelan y Realtime pudo perder eventos:
  // refetch al volver, solo si el catálogo quedó viejo.
  useEffect(() => {
    const onResume = (e: Event) => {
      if (!isResumeSignal(e.type, document.visibilityState)) return;
      if (!menuDataRef.current) return;
      if (Date.now() - fetchedAtRef.current < STALE_MS) return;
      void refresh();
    };
    globalThis.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      globalThis.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [refresh]);

  const value = useMemo<WaiterCatalogValue>(() => ({
    status, empresa, menuData, ensureCatalog, refresh,
  }), [status, empresa, menuData, ensureCatalog, refresh]);

  return (
    <WaiterCatalogContext.Provider value={value}>
      {children}
    </WaiterCatalogContext.Provider>
  );
}

export function useWaiterCatalog(): WaiterCatalogValue {
  return useContext(WaiterCatalogContext);
}
