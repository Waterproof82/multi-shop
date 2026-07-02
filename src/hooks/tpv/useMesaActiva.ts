'use client';

import { useState, useCallback } from 'react';
import type { PedidoItem } from '@/core/domain/entities/types';

type TicketItem = Pick<PedidoItem, 'nombre' | 'precio' | 'cantidad'>;

interface MesaActiva {
  mesaId: string | null;
  sesionId: string | null;
  mesaNumero: number | null;
  items: TicketItem[];
  total: number;
}

const EMPTY: MesaActiva = {
  mesaId: null,
  sesionId: null,
  mesaNumero: null,
  items: [],
  total: 0,
};

function calcTotal(items: TicketItem[]): number {
  return items.reduce((s, i) => s + i.precio * i.cantidad, 0);
}

export function useMesaActiva() {
  const [mesa, setMesa] = useState<MesaActiva>(EMPTY);

  const selectMesa = useCallback((id: string, sesion: string, numero: number) => {
    setMesa(prev => ({ ...prev, mesaId: id, sesionId: sesion, mesaNumero: numero }));
  }, []);

  const clearMesa = useCallback(() => setMesa(EMPTY), []);

  const addItem = useCallback((item: TicketItem) => {
    setMesa(prev => {
      const existing = prev.items.findIndex(i => i.nombre === item.nombre);
      const items: TicketItem[] = existing >= 0
        ? prev.items.map((it, idx) =>
            idx === existing ? { ...it, cantidad: it.cantidad + 1 } : it
          )
        : [...prev.items, { nombre: item.nombre, precio: item.precio, cantidad: 1 }];
      return { ...prev, items, total: calcTotal(items) };
    });
  }, []);

  const removeItem = useCallback((nombre: string) => {
    setMesa(prev => {
      const items = prev.items.filter(i => i.nombre !== nombre);
      return { ...prev, items, total: calcTotal(items) };
    });
  }, []);

  return { mesa, selectMesa, clearMesa, addItem, removeItem };
}
