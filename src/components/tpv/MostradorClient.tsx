'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { useMesaActiva } from '@/hooks/tpv/useMesaActiva';
import { useTpvCatalog } from '@/lib/tpv-catalog-ctx';
import { TicketPanel } from './TicketPanel';
import { NuevoPedidoPanel } from './NuevoPedidoPanel';
import { MenuPanel } from './MenuPanel';
import { MesasGrid } from './MesasGrid';
import { useTpvAcciones } from '@/lib/tpv-acciones-ctx';
import { mesaSesionChannel } from '@/lib/realtime-channels';

export interface ExistingOrder {
  id: string;
  numeroPedido: number;
  estado: string;
  items: { nombre: string; precio: number; cantidad: number; complementos: string[] }[];
  total: number;
  nota: string | null;
  pase: string | null;
}

interface InitialMesa {
  mesaId: string;
  sesionId: string | null;
  mesaNumero: number | null;
  mesaName: string | null;
  existingOrders: ExistingOrder[];
  sesionPagada: boolean;
}

interface Props {
  readonly initialMesa: InitialMesa | null;
}

export function MostradorClient({ initialMesa }: Readonly<Props>) {
  const { turno, products, categories, tipoImpuesto, porcentajeImpuesto, empresaId } = useTpvCatalog();
  const { mesa, addItem, removeItem, clearPending, clearMesa, refreshOrders, updatePendingNota } = useMesaActiva(initialMesa);
  const { registerRefresh, setHasPendingItems } = useTpvAcciones();
  const [yaCobradoCents, setYaCobradoCents] = useState(0);
  const [externalCobro, setExternalCobro] = useState<string | null>(null);
  const [isSesionPagada, setIsSesionPagada] = useState(initialMesa?.sesionPagada ?? false);

  const handleRefresh = useCallback(async () => {
    if (!mesa.sesionId) return;
    const res = await fetch(`/api/tpv/pedidos?sesionId=${mesa.sesionId}`);
    if (res.ok) {
      const json = await res.json() as { orders: ExistingOrder[]; yaCobradoCents: number };
      refreshOrders(json.orders);
      setYaCobradoCents(json.yaCobradoCents);
    }
  }, [mesa.sesionId, refreshOrders]);

  // Sync pending items flag into context so AccionesPanel can hide itself
  useEffect(() => {
    setHasPendingItems(mesa.pendingItems.length > 0);
  }, [mesa.pendingItems.length, setHasPendingItems]);

  // Register refresh fn in AccionesPanel context so the button works from layout level.
  useEffect(() => {
    registerRefresh(mesa.sesionId, handleRefresh);
    return () => registerRefresh(null, null);
  }, [mesa.sesionId, handleRefresh, registerRefresh]);

  // Re-fetch on mount to always show fresh data after navigating back from cobro.
  useEffect(() => {
    void handleRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when the user returns to this tab (e.g. after cancelling orders in waiter panel).
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void handleRefresh();
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [handleRefresh]);

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

    // pedidos no longer grants anon SELECT (RLS hardening), so postgres_changes
    // never fires here — the pedidos_notify_estado_update trigger broadcasts on
    // 'pedido-estado-update' instead. That trigger only fires AFTER
    // pedidos.estado actually changes within the transaction (e.g. once
    // fn_auto_cancel_pedido_when_all_items_cancelled has run), preserving the
    // same commit-safety property postgres_changes had — this is what avoids
    // the item-update-vs-auto-cancel race documented in
    // docs/context/realtime-channels.md (trampa #6). Public channel shared by
    // every pedido in the company, so filter by sesionId client-side.
    const sesionId = mesa.sesionId;
    const chPedidos = supabase
      .channel('pedido-estado-update')
      .on('broadcast', { event: 'update' }, (message: { payload: Record<string, unknown> }) => {
        if (message.payload['sesionId'] !== sesionId) return;
        refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(chNew);
      void supabase.removeChannel(chItems);
      void supabase.removeChannel(chPedidos);
    };
  }, [mesa.sesionId, handleRefresh]);

  // Real-time: detect when the active session is closed externally
  // (waiter cobro, customer direct payment, etc.)
  useEffect(() => {
    if (!mesa.sesionId || !mesa.mesaNumero) return;
    const supabase = getSupabaseAnonClient();
    const sesionId = mesa.sesionId;
    const mesaNumero = mesa.mesaNumero;

    // mesa_sesiones no longer grants anon SELECT (RLS hardening), so postgres_changes
    // never fires here — mesa_sesiones_notify_update broadcasts instead. El topic
    // lleva scope de empresa (ver realtime-channels.ts); dentro de la empresa lo
    // comparten todas las mesas, así que sigue filtrándose por sesionId.
    const ch = supabase
      .channel(mesaSesionChannel(empresaId))
      .on('broadcast', { event: 'update' }, (message: { payload: Record<string, unknown> }) => {
        if (message.payload['sesionId'] !== sesionId) return;
        if (message.payload['cerradaAt']) {
          setExternalCobro(`La mesa ${mesaNumero} ha sido cobrada desde otro canal.`);
          setIsSesionPagada(false);
          setYaCobradoCents(0);
          clearMesa();
        } else if (message.payload['sesionPagada']) {
          setIsSesionPagada(true);
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [mesa.sesionId, mesa.mesaNumero, clearMesa, empresaId]);

  if (!turno) return null;

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
        existingTotal={mesa.existingTotal}
        yaCobradoCents={yaCobradoCents}
        turnoId={turno.id}
        tipoImpuesto={tipoImpuesto}
        porcentajeImpuesto={porcentajeImpuesto}
        sesionPagada={isSesionPagada}
      />
      {!mesa.mesaId ? (
        <MesasGrid modo="seleccionar" />
      ) : (
        <MenuPanel
          products={products}
          categories={categories}
          onAddItem={addItem}
          mesaSeleccionada={!!mesa.mesaId}
        />
      )}
      {mesa.mesaId && mesa.pendingItems.length > 0 && (
        <NuevoPedidoPanel
          sesionId={mesa.sesionId}
          mesaId={mesa.mesaId}
          mesaNumero={mesa.mesaNumero}
          mesaName={mesa.mesaName}
          pendingItems={mesa.pendingItems}
          pendingTotal={mesa.pendingTotal}
          onPendingSent={clearPending}
          onRemovePending={removeItem}
          onUpdatePendingNota={updatePendingNota}
        />
      )}
    </>
  );
}
