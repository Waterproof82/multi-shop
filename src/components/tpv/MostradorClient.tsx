'use client';

import { useCallback, useEffect, useState } from 'react';
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
  sesionId: string | null;
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
  const { mesa, addItem, removeItem, clearPending, clearMesa, refreshOrders } = useMesaActiva(initialMesa);
  const [refreshing, setRefreshing] = useState(false);
  const [yaCobradoCents, setYaCobradoCents] = useState(0);
  const [externalCobro, setExternalCobro] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    if (!mesa.sesionId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/tpv/pedidos?sesionId=${mesa.sesionId}`);
      if (res.ok) {
        const json = await res.json() as { orders: ExistingOrder[]; yaCobradoCents: number };
        refreshOrders(json.orders);
        setYaCobradoCents(json.yaCobradoCents);
      }
    } finally {
      setRefreshing(false);
    }
  }, [mesa.sesionId, refreshOrders]);

  // Re-fetch on mount to always show fresh data after navigating back from cobro.
  useEffect(() => {
    void handleRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time: re-fetch orders when new pedidos arrive or kitchen marks items.
  useEffect(() => {
    if (!mesa.sesionId) return;
    const supabase = getSupabaseAnonClient();
    const refresh = () => { void handleRefresh(); };

    const chNew = supabase
      .channel('waiter-new-order')
      .on('broadcast', { event: 'new-order' }, refresh)
      .subscribe();

    const chItems = supabase
      .channel('waiter-items-update')
      .on('broadcast', { event: 'item-update' }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(chNew);
      void supabase.removeChannel(chItems);
    };
  }, [mesa.sesionId, handleRefresh]);

  // Real-time: detect when the active session is closed externally
  // (waiter cobro, customer direct payment, etc.)
  useEffect(() => {
    if (!mesa.sesionId || !mesa.mesaNumero) return;
    const supabase = getSupabaseAnonClient();
    const sesionId = mesa.sesionId;
    const mesaNumero = mesa.mesaNumero;

    const ch = supabase
      .channel(`tpv-sesion-close-${sesionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mesa_sesiones', filter: `id=eq.${sesionId}` },
        (payload) => {
          const row = payload.new as { cerrada_at: string | null };
          if (row.cerrada_at) {
            setExternalCobro(`La mesa ${mesaNumero} ha sido cobrada desde otro canal.`);
            clearMesa();
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [mesa.sesionId, mesa.mesaNumero, clearMesa]);

  return (
    <>
      {externalCobro && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-[#22c55e] text-white text-sm font-semibold shadow-lg">
          <span>✓</span>
          <span>{externalCobro}</span>
          <button type="button" onClick={() => setExternalCobro(null)} className="ml-2 text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
      )}
      <TicketPanel
        sesionId={mesa.sesionId}
        mesaId={mesa.mesaId}
        mesaNumero={mesa.mesaNumero}
        mesaName={mesa.mesaName}
        existingOrders={mesa.existingOrders}
        pendingItems={mesa.pendingItems}
        existingTotal={mesa.existingTotal}
        pendingTotal={mesa.pendingTotal}
        yaCobradoCents={yaCobradoCents}
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
