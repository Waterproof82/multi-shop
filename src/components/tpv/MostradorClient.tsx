'use client';

import type { TpvTurno } from '@/core/domain/entities/tpv-types';
import type { Product, Category } from '@/core/domain/entities/types';
import { useMesaActiva } from '@/hooks/tpv/useMesaActiva';
import { TicketPanel } from './TicketPanel';
import { MenuPanel } from './MenuPanel';
import { AccionesPanel } from './AccionesPanel';

interface Props {
  readonly turno: TpvTurno;
  readonly products: Product[];
  readonly categories: Category[];
}

export function MostradorClient({ turno, products, categories }: Props) {
  const { mesa, addItem, removeItem } = useMesaActiva();

  return (
    <>
      <TicketPanel
        sesionId={mesa.sesionId}
        mesaNumero={mesa.mesaNumero}
        items={mesa.items}
        total={mesa.total}
        turnoId={turno.id}
        onRemove={removeItem}
      />
      <MenuPanel
        products={products}
        categories={categories}
        onAddItem={addItem}
      />
      <AccionesPanel sesionId={mesa.sesionId} />
    </>
  );
}
