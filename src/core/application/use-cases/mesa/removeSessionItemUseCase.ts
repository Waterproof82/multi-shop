import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { getPedidoRepository } from '@/core/infrastructure/database';
import { logger } from '@/core/infrastructure/logging/logger';

export interface RemoveSessionItemInput {
  sesionId: string;
  empresaId: string;
  nombre: string;
  precio: number;
  cantidadAEliminar: number;
}

export interface RemoveSessionItemResult {
  totalRemoved: number;
}

type Supabase = ReturnType<typeof getSupabaseClient>;
type Item = Record<string, unknown>;
type ItemPedido = { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] };

/**
 * Tolerancia al comparar precios.
 *
 * Los importes viajan como float en JSONB, así que `0.1 + 0.2 !== 0.3`.
 * Comparar por igualdad haría que un plato no se encontrara nunca y el camarero
 * no pudiera quitarlo de la cuenta.
 */
const TOLERANCIA_PRECIO = 0.001;

function esElItemBuscado(item: Item, nombre: string, precio: number): boolean {
  return item.nombre === nombre && Math.abs(Number(item.precio) - precio) < TOLERANCIA_PRECIO;
}

/** Importe de una línea: precio base más complementos, por unidades. */
function importeDeLinea(item: Item): number {
  const complementos = (item.complementos ?? []) as Item[];
  const extra = complementos.reduce((suma, c) => suma + Number(c.precio ?? 0), 0);
  return (Number(item.precio) + extra) * Number(item.cantidad);
}

function calcularTotal(items: Item[]): number {
  return items.reduce((suma, item) => suma + importeDeLinea(item), 0);
}

interface Reconstruccion {
  /** `detalle_pedido` resultante. */
  items: Item[];
  /** Posición vieja → posición nueva. Los ítems que desaparecen no están. */
  reubicacion: Map<number, number>;
}

/**
 * Quita `unidades` del ítem indicado y devuelve el detalle resultante.
 *
 * Función pura, y es donde vive la parte delicada: el mapa de reubicación.
 * `mesa_item_pagos` referencia los ítems por POSICIÓN dentro de
 * `detalle_pedido`, así que al eliminar uno del medio todas las posteriores se
 * desplazan. Sin este mapa, el pago que apuntaba al vino acabaría apuntando al
 * postre — y no se nota hasta que alguien divide la cuenta.
 */
function reconstruirDetalle(items: Item[], nombre: string, precio: number, unidades: number): Reconstruccion {
  let porQuitar = unidades;
  const resultado: Item[] = [];
  const reubicacion = new Map<number, number>();

  for (const [posVieja, item] of items.entries()) {
    const cantidad = Number(item.cantidad);
    const afectado = esElItemBuscado(item, nombre, precio) && porQuitar > 0;

    if (!afectado) {
      reubicacion.set(posVieja, resultado.push(item) - 1);
      continue;
    }
    if (cantidad > porQuitar) {
      reubicacion.set(posVieja, resultado.push({ ...item, cantidad: cantidad - porQuitar }) - 1);
      porQuitar = 0;
      continue;
    }
    // Línea entera fuera: no entra en la reubicación, y su pago se borrará.
    porQuitar -= cantidad;
  }

  return { items: resultado, reubicacion };
}

/**
 * Deja `mesa_item_pagos` alineado con el nuevo `detalle_pedido`.
 *
 * Las reasignaciones van de posición vieja MAYOR a menor a propósito: al revés,
 * mover el 1 al 0 chocaría con la fila que todavía ocupa el 0.
 */
async function sincronizarPagosPorItem(
  supabase: Supabase,
  pedidoId: string,
  totalItemsPrevios: number,
  reubicacion: Map<number, number>,
): Promise<void> {
  const desaparecidos = [...Array(totalItemsPrevios).keys()].filter(i => !reubicacion.has(i));
  if (desaparecidos.length > 0) {
    await supabase.from('mesa_item_pagos').delete()
      .eq('pedido_id', pedidoId)
      .in('item_idx', desaparecidos);
  }

  const desplazados = [...reubicacion.entries()]
    .filter(([vieja, nueva]) => vieja !== nueva)
    .sort(([a], [b]) => b - a);

  for (const [vieja, nueva] of desplazados) {
    await supabase.from('mesa_item_pagos').update({ item_idx: nueva })
      .eq('pedido_id', pedidoId)
      .eq('item_idx', vieja);
  }
}

/** Elimina el pedido entero. Los pagos por ítem PRIMERO, para no dejar huérfanos. */
async function eliminarPedido(supabase: Supabase, pedidoId: string): Promise<void> {
  await supabase.from('mesa_item_pagos').delete().eq('pedido_id', pedidoId);
  await supabase.from('pedidos').delete().eq('id', pedidoId);
}

type Pedido = { id: string; detalle_pedido: unknown };

/**
 * Aplica el borrado a un pedido concreto. Devuelve cuántas unidades quitó, o un
 * error si la reescritura falló.
 */
async function quitarDeUnPedido(
  supabase: Supabase,
  pedido: Pedido,
  input: RemoveSessionItemInput,
  maximo: number,
): Promise<Result<number, AppError>> {
  const items = pedido.detalle_pedido as Item[];
  const coincidencias = items.filter(i => esElItemBuscado(i, input.nombre, input.precio));
  if (coincidencias.length === 0) return { success: true, data: 0 };

  const disponibles = coincidencias.reduce((suma, i) => suma + Number(i.cantidad), 0);
  const aQuitar = Math.min(disponibles, maximo);

  const { items: nuevos, reubicacion } = reconstruirDetalle(items, input.nombre, input.precio, aQuitar);

  if (nuevos.length === 0) {
    await eliminarPedido(supabase, pedido.id);
    return { success: true, data: aQuitar };
  }

  const actualizado = await getPedidoRepository().updateOrderItems(
    pedido.id,
    nuevos as ItemPedido[],
    calcularTotal(nuevos),
  );
  if (!actualizado.success) return { success: false, error: actualizado.error };

  await sincronizarPagosPorItem(supabase, pedido.id, items.length, reubicacion);
  return { success: true, data: aQuitar };
}

/** Suma en céntimos de lo que queda por cobrar en la sesión. */
async function totalSesionCents(supabase: Supabase, sesionId: string, empresaId: string): Promise<number> {
  const { data } = await supabase
    .from('pedidos')
    .select('total')
    .eq('sesion_id', sesionId)
    .eq('empresa_id', empresaId);
  const filas = (data ?? []) as { total: number }[];
  return Math.round(filas.reduce((suma, p) => suma + Number(p.total), 0) * 100);
}

/** Suma en céntimos de lo que los comensales ya han pagado a la carta. */
async function pagadoCents(supabase: Supabase, sesionId: string): Promise<number> {
  const { data } = await supabase
    .from('mesa_pagos_personalizados')
    .select('importe_cents')
    .eq('sesion_id', sesionId)
    .eq('status', 'pagado');
  const filas = (data ?? []) as { importe_cents: number | null }[];
  return filas.reduce((suma, t) => suma + (t.importe_cents ?? 0), 0);
}

/**
 * Cierra la cuenta si, tras el borrado, lo ya pagado cubre el total.
 *
 * Solo aplica a la división "personalizada" (cada uno paga lo suyo). El caso
 * real: el camarero quita el último plato que nadie había asumido, y lo que ya
 * habían puesto los demás pasa a cubrirlo todo. Sin esto, la mesa se quedaría
 * abierta esperando un pago que ya no hace falta.
 */
async function cerrarSesionSiQuedaCubierta(supabase: Supabase, input: RemoveSessionItemInput): Promise<void> {
  const { data } = await supabase
    .from('mesa_sesiones')
    .select('division_tipo, sesion_pagada')
    .eq('id', input.sesionId)
    .maybeSingle();

  const sesion = data as { division_tipo: string | null; sesion_pagada: boolean } | null;
  if (sesion?.division_tipo !== 'personalizado' || sesion.sesion_pagada) return;

  const totalCents = await totalSesionCents(supabase, input.sesionId, input.empresaId);
  if (totalCents <= 0) return;

  if (await pagadoCents(supabase, input.sesionId) < totalCents) return;

  await supabase
    .from('pedidos')
    .update({ payment_status: 'paid' })
    .eq('sesion_id', input.sesionId)
    .eq('empresa_id', input.empresaId);
  await supabase
    .from('mesa_sesiones')
    .update({ sesion_pagada: true, pago_en_curso: false, pago_iniciado_en: null })
    .eq('id', input.sesionId);
}

/**
 * Quita N unidades de un plato de una cuenta de mesa abierta.
 *
 * Las unidades se descuentan recorriendo los pedidos de la sesión en orden
 * hasta completar la cantidad pedida: un mismo plato puede estar repartido
 * entre varias comandas de la misma mesa.
 */
export async function removeSessionItemUseCase(
  input: RemoveSessionItemInput
): Promise<Result<RemoveSessionItemResult, AppError>> {
  try {
    const supabase = getSupabaseClient();

    const pedidos = await getPedidoRepository().findBySesionId(input.sesionId);
    if (!pedidos.success) return { success: false, error: pedidos.error };

    let restante = input.cantidadAEliminar;
    let totalRemoved = 0;

    for (const pedido of pedidos.data) {
      if (restante <= 0) break;

      const quitadas = await quitarDeUnPedido(supabase, pedido, input, restante);
      if (!quitadas.success) return { success: false, error: quitadas.error };

      restante -= quitadas.data;
      totalRemoved += quitadas.data;
    }

    if (totalRemoved > 0) {
      await cerrarSesionSiQuedaCubierta(supabase, input);
    }

    return { success: true, data: { totalRemoved } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'removeSessionItemUseCase', {
      details: { sesionId: input.sesionId },
    });
    return { success: false, error: appError };
  }
}
