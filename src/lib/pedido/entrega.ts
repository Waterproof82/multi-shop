export type TipoEntrega = 'recogida' | 'domicilio';

/**
 * Tienda guarda la modalidad copiada en el pedido; restaurante, el `origen`.
 * Sin ninguno de los dos no se inventa un método. Lo comparten el email de
 * confirmación, el aviso de Telegram y la página de seguimiento: los tres
 * tienen que contar la misma entrega.
 */
export function tipoEntregaDelPedido(p: { modalidad_entrega_tipo?: TipoEntrega | null; origen?: string | null }): TipoEntrega | null {
  if (p.modalidad_entrega_tipo) return p.modalidad_entrega_tipo;
  if (p.origen === 'delivery') return 'domicilio';
  if (p.origen === 'recogida') return 'recogida';
  return null;
}
