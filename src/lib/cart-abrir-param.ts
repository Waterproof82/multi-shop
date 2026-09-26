import { t } from "@/lib/translations";
import type { Language } from "@/lib/language-context";

export const PARAM_ABRIR_CARRITO = "carrito";
export const VALOR_ABRIR_CARRITO = "abierto";
export const HREF_CARTA_CON_CARRITO = `/carta?${PARAM_ABRIR_CARRITO}=${VALOR_ABRIR_CARRITO}`;

/**
 * Nombre accesible de los botones del carrito. El `aria-label` REEMPLAZA al
 * texto interior, asi que el contador del badge no se anunciaria: se incluye
 * aqui ("Abrir carrito, 3 artículos") y el badge va con aria-hidden.
 */
export function etiquetaAbrirCarrito(totalItems: number, language: Language): string {
  const base = t("openCart", language);
  if (totalItems <= 0) return base;
  const unidad = totalItems === 1 ? t("itemSingular", language) : t("itemsPlural", language);
  return `${base}, ${totalItems} ${unidad}`;
}
