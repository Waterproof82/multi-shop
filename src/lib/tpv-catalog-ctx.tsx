'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { Category, Product } from '@/core/domain/entities/types';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';
import type { MesaWithSession } from '@/core/domain/repositories/IMesaRepository';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';

interface TpvCatalogContextValue {
  products: Product[];
  categories: Category[];
  tipoImpuesto: 'iva' | 'igic';
  porcentajeImpuesto: number;
  turno: TpvTurno | null;
  setTurno: (turno: TpvTurno | null) => void;
  mesas: MesaWithSession[];
  refreshMesas: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
}

const TpvCatalogContext = createContext<TpvCatalogContextValue>({
  products: [],
  categories: [],
  tipoImpuesto: 'iva',
  porcentajeImpuesto: 10,
  turno: null,
  setTurno: () => { /* no-op default */ },
  mesas: [],
  refreshMesas: async () => { /* no-op default */ },
  refreshCatalog: async () => { /* no-op default */ },
});

interface TpvCatalogProviderProps {
  readonly children: React.ReactNode;
  readonly initialProducts: Product[];
  readonly initialCategories: Category[];
  readonly tipoImpuesto: 'iva' | 'igic';
  readonly porcentajeImpuesto: number;
  readonly initialTurno: TpvTurno | null;
  readonly initialMesas: MesaWithSession[];
  readonly empresaId: string;
}

type CatalogResponse = {
  products: Product[];
  categories: Category[];
};

type MesasResponse = {
  mesas: MesaWithSession[];
};

export function TpvCatalogProvider({
  children,
  initialProducts,
  initialCategories,
  tipoImpuesto,
  porcentajeImpuesto,
  initialTurno,
  initialMesas,
  empresaId,
}: Readonly<TpvCatalogProviderProps>) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [turno, setTurno] = useState<TpvTurno | null>(initialTurno);
  const [mesas, setMesas] = useState<MesaWithSession[]>(initialMesas);

  const instanceId = useId().replace(/:/g, '-');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogChannelName = useRef(`tpv-catalog-${instanceId}`);
  const mesasChannelName = useRef(`tpv-mesas-${instanceId}`);

  const refreshCatalog = useCallback(async () => {
    const res = await fetch('/api/tpv/catalog');
    if (!res.ok) return;
    const json = await res.json() as CatalogResponse;
    setProducts(json.products);
    setCategories(json.categories);
  }, []);

  const refreshMesas = useCallback(async () => {
    const res = await fetch('/api/tpv/mesas');
    if (!res.ok) return;
    const json = await res.json() as MesasResponse;
    setMesas(json.mesas);
  }, []);

  const scheduleCatalogRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void refreshCatalog();
    }, 400);
  }, [refreshCatalog]);

  useEffect(() => {
    const supabase = getSupabaseAnonClient();

    const catalogCh = supabase
      .channel(catalogChannelName.current)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'productos',
        filter: `empresa_id=eq.${empresaId}`,
      }, scheduleCatalogRefresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'categorias',
        filter: `empresa_id=eq.${empresaId}`,
      }, scheduleCatalogRefresh)
      .subscribe();

    const mesasCh = supabase
      .channel(mesasChannelName.current)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'mesa_sesiones',
      }, () => { void refreshMesas(); })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(catalogCh);
      void supabase.removeChannel(mesasCh);
    };
  }, [empresaId, scheduleCatalogRefresh, refreshMesas]);

  return (
    <TpvCatalogContext.Provider
      value={{
        products,
        categories,
        tipoImpuesto,
        porcentajeImpuesto,
        turno,
        setTurno,
        mesas,
        refreshMesas,
        refreshCatalog,
      }}
    >
      {children}
    </TpvCatalogContext.Provider>
  );
}

export function useTpvCatalog(): TpvCatalogContextValue {
  return useContext(TpvCatalogContext);
}
