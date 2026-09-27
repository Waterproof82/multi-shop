import type { ComplementVM, MenuItemVM } from "@/core/application/dtos/menu-view-model";
import type { CartItem, Complement } from "@/lib/cart-context";

/**
 * Carrito de la tienda publica guardado en localStorage para sobrevivir a una
 * recarga o a cerrar la pestaña.
 *
 * Se guarda lo MINIMO (ids, cantidad, nota) y se reconstruye contra la carta
 * ACTUAL al volver: guardar el MenuItemVM entero resucitaria precios, nombres
 * o productos que el admin ya cambio o desactivo.
 *
 * Solo en empresas tipo tienda. Nunca en restaurante (el pedido es del
 * momento: mesa, barra o recogida) ni en modo mesa o camarero: ahi el carrito
 * pertenece a una mesa (ver useCarritoPorMesa) y resucitarlo lo colaria en otra.
 */

export const CADUCIDAD_CARRITO_MS = 7 * 24 * 60 * 60 * 1000;
const VERSION = 1;
const CANTIDAD_MAX = 99;

export function claveCarritoGuardado(empresaId: string): string {
  return `carrito:v${VERSION}:${empresaId}`;
}

export function debePersistirCarrito(ctx: Readonly<{
  showCart: boolean;
  isWaiterMode: boolean;
  esRestaurante: boolean;
  mesaId: string | null;
  search: string;
}>): boolean {
  if (!ctx.showCart || ctx.esRestaurante || ctx.isWaiterMode || ctx.mesaId !== null) return false;
  // useMesaId lee ?mesa= en un efecto (null en el primer render): se mira
  // la URL directamente para no confundir una mesa con la tienda.
  return !new URLSearchParams(ctx.search).has("mesa");
}

interface LineaGuardada {
  productoId: string;
  cantidad: number;
  complementoIds: string[];
  nota?: string;
}

export interface LineaRestaurada {
  item: MenuItemVM;
  cantidad: number;
  complementos: Complement[] | undefined;
  nota: string | undefined;
}

export function serializarCarrito(items: readonly CartItem[], ahora: number): string {
  const lineas: LineaGuardada[] = items
    .filter((ci) => !ci.justRemoved)
    .map((ci) => ({
      productoId: ci.item.id,
      cantidad: ci.quantity,
      complementoIds: (ci.selectedComplements ?? []).map((c) => c.id),
      ...(ci.note ? { nota: ci.note } : {}),
    }));
  return JSON.stringify({ v: VERSION, guardadoEn: ahora, lineas });
}

function leerLineas(raw: string | null, ahora: number): unknown[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return [];
    const { v, guardadoEn, lineas } = data as Record<string, unknown>;
    if (v !== VERSION || typeof guardadoEn !== "number" || !Array.isArray(lineas)) return [];
    if (ahora - guardadoEn > CADUCIDAD_CARRITO_MS) return [];
    return lineas;
  } catch {
    return [];
  }
}

function esLineaValida(l: unknown): l is LineaGuardada {
  if (typeof l !== "object" || l === null) return false;
  const { productoId, cantidad, complementoIds, nota } = l as Record<string, unknown>;
  return typeof productoId === "string"
    && Number.isInteger(cantidad) && (cantidad as number) >= 1 && (cantidad as number) <= CANTIDAD_MAX
    && Array.isArray(complementoIds) && complementoIds.every((id) => typeof id === "string")
    && (nota === undefined || typeof nota === "string");
}

function opcionesDe(item: MenuItemVM): Map<string, ComplementVM> {
  const porId = new Map<string, ComplementVM>();
  for (const c of item.complements ?? []) porId.set(c.id, c);
  for (const g of item.complementGroups ?? []) {
    for (const o of g.opciones) porId.set(o.id, o);
  }
  return porId;
}

// null si algun complemento elegido ya no existe: mejor quitar la linea que
// cambiarle la eleccion al cliente en silencio.
function resolverComplementos(item: MenuItemVM, ids: string[]): Complement[] | undefined | null {
  if (ids.length === 0) return undefined;
  const opciones = opcionesDe(item);
  const resueltos: Complement[] = [];
  for (const id of ids) {
    const o = opciones.get(id);
    if (!o) return null;
    resueltos.push({ id: o.id, name: o.name, price: o.price });
  }
  return resueltos;
}

export function restaurarCarrito(
  raw: string | null,
  productos: readonly MenuItemVM[],
  ahora: number,
): LineaRestaurada[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const restauradas: LineaRestaurada[] = [];
  for (const l of leerLineas(raw, ahora)) {
    if (!esLineaValida(l)) continue;
    const item = porId.get(l.productoId);
    if (!item) continue;
    const complementos = resolverComplementos(item, l.complementoIds);
    if (complementos === null) continue;
    restauradas.push({ item, cantidad: l.cantidad, complementos, nota: l.nota || undefined });
  }
  return restauradas;
}
