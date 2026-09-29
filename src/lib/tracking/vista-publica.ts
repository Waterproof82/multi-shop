import { tipoEntregaDelPedido } from '@/lib/pedido/entrega';

export interface ItemSeguimiento {
  nombre: string;
  translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } };
  cantidad: number;
  precio: number;
  complementos?: { nombre: string; precio: number }[];
}

/** Pedido tal como lo devuelve `findByTrackingToken`. */
export interface PedidoSeguimiento {
  id: string;
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
  telegram_message_id: string | null;
  telegram_chat_id: string | null;
  tipo: string;
  estado: string;
  glovo_status: string | null;
  mesa_id: string | null;
  mesa_numero: number | null;
  mesa_nombre: string | null;
  delivery_fee_cents: number | null;
  payment_status?: string | null;
  sesion_id: string | null;
  google_reviews_url: string | null;
  total: number | null;
  modalidad_entrega_tipo: 'recogida' | 'domicilio' | null;
  modalidad_entrega_nombre: string | null;
  modalidad_entrega_precio_cents: number | null;
  direccion_entrega: string | null;
  origen: string | null;
  numero_seguimiento: string | null;
  descuento_porcentaje: number | null;
  items: ItemSeguimiento[];
}

/**
 * Lo que sale a la página pública de seguimiento. La usan la API y el render
 * del servidor: antes la página pasaba el objeto entero y `telegram_chat_id`
 * acababa en el HTML. Nada de Telegram, ni el id interno del pedido.
 */
export function vistaPublicaSeguimiento(p: PedidoSeguimiento) {
  const aDomicilio = tipoEntregaDelPedido(p) === 'domicilio';
  return {
    numero_pedido: p.numero_pedido,
    estimated_minutes: p.estimated_minutes,
    estimated_ready_at: p.estimated_ready_at,
    items: p.items,
    tipo: p.tipo,
    estado: p.estado,
    glovo_status: p.glovo_status,
    delivery_fee_cents: p.delivery_fee_cents,
    mesa_id: p.mesa_id,
    mesa_numero: p.mesa_numero,
    mesa_nombre: p.mesa_nombre,
    sesion_id: p.sesion_id,
    google_reviews_url: p.google_reviews_url,
    total: p.total,
    payment_status: p.payment_status ?? null,
    origen: p.origen,
    modalidad_entrega_tipo: p.modalidad_entrega_tipo,
    modalidad_entrega_nombre: p.modalidad_entrega_nombre,
    modalidad_entrega_precio_cents: p.modalidad_entrega_precio_cents,
    direccion_entrega: aDomicilio ? p.direccion_entrega : null,
    numero_seguimiento: p.numero_seguimiento,
    descuento_porcentaje: p.descuento_porcentaje,
  };
}

export type VistaSeguimiento = ReturnType<typeof vistaPublicaSeguimiento>;
