'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';
import type { Product, Category } from '@/core/domain/entities/types';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { useMesaActiva } from '@/hooks/tpv/useMesaActiva';
import { TicketPanel } from './TicketPanel';
import { MenuPanel } from './MenuPanel';
import { AccionesPanel } from './AccionesPanel';

export interface ExistingOrder {
  id: string;
  numeroPedido: number;
  estado: string;
  items: { nombre: string; precio: number; cantidad: number; complementos: string[] }[];
  total: number;
}

interface InitialMesa {
  mesaId: string;
  sesionId: string;
  mesaNumero: number | null;
  mesaName: string | null;
  existingOrders: ExistingOrder[];
}

interface Props {
  readonly turno: TpvTurno;
  readonly products: Product[];
  readonly categories: Category[];
  readonly initialMesa: InitialMesa | null;
}

export function MostradorClient({ turno, products, categories, initialMesa }: Props) {
  const { mesa, addItem, removeItem, clearPending, refreshOrders } = useMesaActiva(initialMesa);
  const [refreshing, setRefreshing] = useState(false);
  // Stable ref for the channel name — avoids React StrictMode double-mount closing the channel.
  const channelRef = useRef(`tpv-pedidos-${Math.random().toString(36).slice(2)}`);

  const handleRefresh = useCallback(async () => {
    if (!mesa.sesionId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/tpv/pedidos?sesionId=${mesa.sesionId}`);
      if (res.ok) {
        const orders = await res.json() as ExistingOrder[];
        refreshOrders(orders);
      }
    } finally {
      setRefreshing(false);
    }
  }, [mesa.sesionId, refreshOrders]);

  // Real-time: re-fetch orders whenever any pedido changes.
  // We intentionally skip the sesion_id filter here: Supabase postgres_changes
  // only supports column filters on replica identity columns (usually just the PK),
  // so filtering by sesion_id would silently drop all events. Instead we subscribe
  // to the full table and let handleRefresh (which already scopes by sesionId) do
  // the filtering. RLS limits events to this empresa anyway.
  useEffect(() => {
    if (!mesa.sesionId) return;
    const supabase = getSupabaseAnonClient();
    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },
        () => { void handleRefresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // handleRefresh is stable while sesionId stays the same.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesa.sesionId]);

  return (
    <>
      <TicketPanel
        sesionId={mesa.sesionId}
        mesaId={mesa.mesaId}
        mesaNumero={mesa.mesaNumero}
        mesaName={mesa.mesaName}
        existingOrders={mesa.existingOrders}
        pendingItems={mesa.pendingItems}
        existingTotal={mesa.existingTotal}
        pendingTotal={mesa.pendingTotal}
        turnoId={turno.id}
        onRemovePending={removeItem}
        onPendingSent={clearPending}
      />
      <MenuPanel
        products={products}
        categories={categories}
        onAddItem={addItem}
      />
      <AccionesPanel
        sesionId={mesa.sesionId}
        turnoId={turno.id}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
    </>
  );
}
