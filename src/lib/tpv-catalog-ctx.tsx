'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { Category, Product } from '@/core/domain/entities/types';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';
import type { MesaWithSession } from '@/core/domain/repositories/IMesaRepository';
import type { ComplementoGrupo, ProductoComplementoAsignacion } from '@/core/domain/entities/complemento-types';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { saveCatalogToIDB, loadCatalogFromIDB } from '@/lib/tpv/tpv-catalog-db';

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
  complementoGruposByProductId: Map<string, ComplementoGrupo[]>;
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
  complementoGruposByProductId: new Map(),
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
  readonly initialComplementoGrupos: ComplementoGrupo[];
  readonly initialProductoGrupos: ProductoComplementoAsignacion[];
}

type CatalogResponse = {
  products: Product[];
  categories: Category[];
  complementoGrupos: ComplementoGrupo[];
  productoGrupos: ProductoComplementoAsignacion[];
};

function buildComplementoMap(
  grupos: ComplementoGrupo[],
  asignaciones: ProductoComplementoAsignacion[],
): Map<string, ComplementoGrupo[]> {
  const gruposById = new Map(grupos.map(g => [g.id, g]));
  const map = new Map<string, ComplementoGrupo[]>();
  for (const asig of asignaciones) {
    const grupo = gruposById.get(asig.grupoId);
    if (!grupo) continue;
    const arr = map.get(asig.productoId) ?? [];
    arr.push(grupo);
    map.set(asig.productoId, arr);
  }
  return map;
}

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
  initialComplementoGrupos,
  initialProductoGrupos,
}: Readonly<TpvCatalogProviderProps>) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [turno, setTurno] = useState<TpvTurno | null>(initialTurno);
  const [mesas, setMesas] = useState<MesaWithSession[]>(initialMesas);
  const [complementoGruposByProductId, setComplementoGruposByProductId] = useState<Map<string, ComplementoGrupo[]>>(
    () => buildComplementoMap(initialComplementoGrupos, initialProductoGrupos)
  );

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
    setComplementoGruposByProductId(
      buildComplementoMap(json.complementoGrupos ?? [], json.productoGrupos ?? [])
    );
    void saveCatalogToIDB(json.products, json.categories, { tipoImpuesto, porcentajeImpuesto });
  }, [tipoImpuesto, porcentajeImpuesto]);

  const refreshMesas = useCallback(async () => {
    const res = await fetch('/api/tpv/mesas');
    if (!res.ok) return;
    const json = await res.json() as MesasResponse;
    setMesas(json.mesas);
  }, []);

  // Sync catalog with IndexedDB on every fresh load
  useEffect(() => {
    if (initialProducts.length > 0) {
      void saveCatalogToIDB(initialProducts, initialCategories, { tipoImpuesto, porcentajeImpuesto });
      return;
    }
    // Layout returned empty (e.g. Supabase unreachable) — try IDB fallback
    loadCatalogFromIDB().then(snapshot => {
      if (!snapshot) return;
      setProducts(snapshot.products);
      setCategories(snapshot.categories);
    }).catch(() => { /* IDB unavailable, stay empty */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount — initialProducts is the server snapshot

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
        complementoGruposByProductId,
      }}
    >
      {children}
    </TpvCatalogContext.Provider>
  );
}

export function useTpvCatalog(): TpvCatalogContextValue {
  return useContext(TpvCatalogContext);
}
