export const PEDIDO_ESTADOS = ['pendiente', 'anotado', 'servido', 'cerrado', 'aceptado', 'preparando', 'listo', 'en_camino', 'enviado', 'entregado', 'cancelado'] as const;
export type PedidoEstado = typeof PEDIDO_ESTADOS[number];

export type OrigenPedido = 'mesa' | 'recogida' | 'web' | 'delivery';

/** Linear progression per origin type (excludes 'cancelado' — separate action) */
export const ESTADOS_POR_ORIGEN: Record<OrigenPedido, readonly PedidoEstado[]> = {
  mesa:     ['pendiente', 'anotado', 'servido'],
  recogida: ['pendiente', 'aceptado', 'preparando', 'listo', 'entregado'],
  web:      ['pendiente', 'aceptado', 'preparando', 'enviado', 'entregado'],
  delivery: ['pendiente', 'aceptado', 'preparando', 'listo', 'en_camino', 'entregado'],
};

export function getOrigenPedido(mesaId: string | null, trackingToken: string | null, origen?: string | null): OrigenPedido {
  if (mesaId) return 'mesa';
  if (origen === 'delivery') return 'delivery';
  if (trackingToken) return 'recogida';
  return 'web';
}

export const PEDIDO_ESTADO_LABELS: Record<PedidoEstado, string> = {
  pendiente:  'Pendiente',
  anotado:    'Anotado',
  servido:    'Servido',
  cerrado:    'Cerrado',
  aceptado:   'Aceptado',
  preparando: 'Preparando',
  listo:      'Listo',
  en_camino:  'En camino',
  enviado:    'Enviado',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
};

export const PEDIDO_ESTADO_COLORS: Record<PedidoEstado, string> = {
  pendiente:  'bg-status-pending-bg text-status-pending-text hover:bg-status-pending-hover',
  anotado:    'bg-amber-500/20 text-amber-300 border border-amber-400/30 hover:bg-amber-500/30',
  servido:    'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30',
  cerrado:    'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  aceptado:   'bg-status-accepted-bg text-status-accepted-text hover:bg-status-accepted-hover',
  preparando: 'bg-status-preparing-bg text-status-preparing-text hover:bg-status-preparing-hover',
  listo:      'bg-teal-500/20 text-teal-300 border border-teal-400/30 hover:bg-teal-500/30',
  en_camino:  'bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30',
  enviado:    'bg-status-sent-bg text-status-sent-text hover:bg-status-sent-hover',
  entregado:  'bg-status-delivered-bg text-status-delivered-text hover:bg-status-delivered-hover',
  cancelado:  'bg-status-cancelled-bg text-status-cancelled-text hover:bg-status-cancelled-hover',
};
