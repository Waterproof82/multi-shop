import type { Complement } from "./cart-context";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";

export function getItemKey(item: MenuItemVM, complements?: Complement[], note?: string, pase?: string | null): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  const noteKey = note?.trim() || '';
  const paseKey = pase || '';
  return `${item.id}-${complementIds}-${noteKey}-${paseKey}`;
}
