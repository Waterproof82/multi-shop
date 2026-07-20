/**
 * Resuelve el porcentaje de impuesto efectivo para un producto.
 * Override del producto > default de empresa.
 */
export function resolveImpuestoPorcentaje(
  productoOverride: number | null | undefined,
  empresaPorcentaje: number,
): number {
  return productoOverride ?? empresaPorcentaje;
}
