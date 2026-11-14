import type { Complement } from "./cart-context";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";

export function getItemKey(item: MenuItemVM, complements?: Complement[], note?: string, pase?: string | null, personas?: number): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  const noteKey = note?.trim() || '';
  const paseKey = pase || '';
  // personas del configurador (kits): el mismo producto a N distinto es una
  // línea de carrito distinta (precio y receta escalados por el server).
  return `${item.id}-${complementIds}-${noteKey}-${paseKey}-${personas ?? ''}`;
}
