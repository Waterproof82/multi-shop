'use client';

import { useState, useCallback } from 'react';
import type { ExistingOrder } from '@/components/tpv/MostradorClient';

export interface PendingItem {
  productId: string;
  nombre: string;
  precio: number;       // base price — immutable
  precioTotal: number;  // precio + sum of complementos[].precio
  cantidad: number;
  complementos: { nombre: string; precio: number }[];
  nota?: string;
}

interface MesaActiva {
  mesaId: string | null;
  sesionId: string | null;
  mesaNumero: number | null;
  mesaName: string | null;
  existingOrders: ExistingOrder[];
  pendingItems: PendingItem[];
  existingTotal: number;
  pendingTotal: number;
}

interface InitialMesa {
  mesaId: string;
  sesionId: string | null;
  mesaNumero: number | null;
  mesaName: string | null;
  existingOrders: ExistingOrder[];
}

function calcExistingTotal(orders: ExistingOrder[]): number {
  return orders.reduce((sum, o) => sum + o.total, 0);
}

function calcPendingTotal(items: PendingItem[]): number {
  return items.reduce((sum, i) => sum + i.precioTotal * i.cantidad, 0);
}

function buildInitial(init: InitialMesa | null): MesaActiva {
  if (!init) {
    return { mesaId: null, sesionId: null, mesaNumero: null, mesaName: null, existingOrders: [], pendingItems: [], existingTotal: 0, pendingTotal: 0 };
  }
  return {
    mesaId: init.mesaId,
    sesionId: init.sesionId,
    mesaNumero: init.mesaNumero,
    mesaName: init.mesaName,
    existingOrders: init.existingOrders,
    pendingItems: [],
    existingTotal: calcExistingTotal(init.existingOrders),
    pendingTotal: 0,
  };
}

export function useMesaActiva(initial: InitialMesa | null = null) {
  const [mesa, setMesa] = useState<MesaActiva>(() => buildInitial(initial));

  const refreshOrders = useCallback((orders: ExistingOrder[]) => {
    setMesa(prev => {
      // If clearMesa() was already called, mesaId is null — ignore stale async refreshes.
      if (!prev.mesaId) return prev;
      return { ...prev, existingOrders: orders, existingTotal: calcExistingTotal(orders) };
    });
  }, []);

  const selectMesa = useCallback((id: string, sesion: string, numero: number, name: string | null = null) => {
    setMesa(prev => ({ ...prev, mesaId: id, sesionId: sesion, mesaNumero: numero, mesaName: name }));
  }, []);

  const clearMesa = useCallback(() => setMesa(buildInitial(null)), []);

  const addItem = useCallback((item: Omit<PendingItem, 'cantidad'>) => {
    setMesa(prev => {
      const complementos = item.complementos ?? [];
      const key = complementos.map((c: { nombre: string; precio: number }) => c.nombre).join(',');
      const existing = prev.pendingItems.findIndex(
        i => i.productId === item.productId && i.complementos.map(c => c.nombre).join(',') === key
      );
      const pendingItems: PendingItem[] = existing >= 0
        ? prev.pendingItems.map((it, idx) =>
            idx === existing ? { ...it, cantidad: it.cantidad + 1 } : it
          )
        : [...prev.pendingItems, {
            productId: item.productId,
            nombre: item.nombre,
            precio: item.precio,
            precioTotal: item.precioTotal,
            cantidad: 1,
            complementos,
            nota: item.nota,
          }];
      return { ...prev, pendingItems, pendingTotal: calcPendingTotal(pendingItems) };
    });
  }, []);

  const removeItem = useCallback((nombre: string, complementos: { nombre: string; precio: number }[] = []) => {
    setMesa(prev => {
      const key = complementos.map(c => c.nombre).join(',');
      const pendingItems = prev.pendingItems.filter(
        i => !(i.nombre === nombre && i.complementos.map(c => c.nombre).join(',') === key)
      );
      return { ...prev, pendingItems, pendingTotal: calcPendingTotal(pendingItems) };
    });
  }, []);

  const clearPending = useCallback(() => {
    setMesa(prev => ({ ...prev, pendingItems: [], pendingTotal: 0 }));
  }, []);

  const updatePendingNota = useCallback((productId: string, complementos: { nombre: string; precio: number }[], nota: string | undefined) => {
    setMesa(prev => {
      const key = complementos.map(c => c.nombre).join(',');
      return {
        ...prev,
        pendingItems: prev.pendingItems.map(it =>
          it.productId === productId && it.complementos.map(c => c.nombre).join(',') === key
            ? { ...it, nota: nota || undefined }
            : it
        ),
      };
    });
  }, []);

  return { mesa, selectMesa, clearMesa, addItem, removeItem, clearPending, refreshOrders, updatePendingNota };
}
