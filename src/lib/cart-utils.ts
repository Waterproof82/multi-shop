import type { Complement } from "./cart-context";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";

export function getItemKey(item: MenuItemVM, complements?: Complement[]): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  return `${item.id}-${complementIds}`;
}
