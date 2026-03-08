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
  pendiente: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  aceptado: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  preparando: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  enviado: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
  entregado: 'bg-green-100 text-green-800 hover:bg-green-200',
  cancelado: 'bg-red-100 text-red-800 hover:bg-red-200',
};
