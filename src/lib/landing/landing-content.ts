import type { EmpresaPublic } from "@/core/domain/entities/types";

export function hasNosotrosContent(descripcion: EmpresaPublic['descripcion']): boolean {
  if (!descripcion) return false;
  return Object.values(descripcion).some((text) => Boolean(text?.trim()));
}

export function hasDondeEstamosContent(
  empresa: Pick<EmpresaPublic, 'direccion' | 'telefono' | 'urlMapa'>
): boolean {
  return Boolean(empresa.direccion || empresa.telefono || empresa.urlMapa);
}
