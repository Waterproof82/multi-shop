'use client';

import { useCallback, useState } from 'react';
import type { TpvTurno } from '@/core/domain/entities/tpv-types';
import type { Product, Category } from '@/core/domain/entities/types';
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
