export const PEDIDO_ESTADOS = ['pendiente', 'aceptado', 'preparando', 'enviado', 'entregado', 'cancelado'] as const;
export type PedidoEstado = typeof PEDIDO_ESTADOS[number];

export const PEDIDO_ESTADO_LABELS: Record<PedidoEstado, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptado',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const PEDIDO_ESTADO_COLORS: Record<PedidoEstado, string> = {
  pendiente: 'bg-status-pending-bg text-status-pending-text hover:bg-status-pending-hover',
  aceptado: 'bg-status-accepted-bg text-status-accepted-text hover:bg-status-accepted-hover',
  preparando: 'bg-status-preparing-bg text-status-preparing-text hover:bg-status-preparing-hover',
  enviado: 'bg-status-sent-bg text-status-sent-text hover:bg-status-sent-hover',
  entregado: 'bg-status-delivered-bg text-status-delivered-text hover:bg-status-delivered-hover',
  cancelado: 'bg-status-cancelled-bg text-status-cancelled-text hover:bg-status-cancelled-hover',
};
