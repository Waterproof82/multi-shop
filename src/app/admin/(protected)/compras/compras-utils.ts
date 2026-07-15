import type { PedidoCompraEstado, AlbaranEstado, EstadoPago } from '@/core/domain/entities/compras-types';

export function pedidoEstadoClass(estado: PedidoCompraEstado): string {
  if (estado === 'borrador') return 'bg-yellow-500/20 border border-yellow-400/30 text-yellow-300';
  if (estado === 'enviado') return 'bg-blue-500/20 border border-blue-400/30 text-blue-300';
  if (estado === 'recibido') return 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-300';
  return 'bg-gray-500/20 border border-gray-400/30 text-gray-300';
}

export function albaranEstadoClass(estado: AlbaranEstado): string {
  if (estado === 'borrador') return 'bg-yellow-500/20 border border-yellow-400/30 text-yellow-300';
  return 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-300';
}

export function estadoPagoClass(estado: EstadoPago): string {
  if (estado === 'pendiente') return 'bg-yellow-500/20 border border-yellow-400/30 text-yellow-300';
  if (estado === 'pagado_banco') return 'bg-blue-500/20 border border-blue-400/30 text-blue-300';
  return 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-300';
}
