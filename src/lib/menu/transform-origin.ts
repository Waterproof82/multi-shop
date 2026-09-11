/**
 * Punto de origen (en píxeles, relativo al propio `DialogContent`) para que
 * la animación de apertura del diálogo de subcategorías "nazca" desde el
 * botón tocado en vez de crecer siempre desde el centro.
 *
 * `DialogContent` se posiciona con `top:50%; left:50%` ANTES de aplicar su
 * propio `translate(-50%,-50%)` — su esquina superior-izquierda (sin
 * transformar) cae exactamente en el centro del viewport. `transform-origin`
 * en píxeles es relativo a ESA esquina, así que restar el centro del
 * viewport a la posición del click da la coordenada local correcta sin
 * necesidad de medir el tamaño del panel.
 */
export function transformOriginFromClick(
  clickX: number,
  clickY: number,
  viewportWidth: number,
  viewportHeight: number,
): string {
  const originX = clickX - viewportWidth / 2;
  const originY = clickY - viewportHeight / 2;
  return `${originX}px ${originY}px`;
}
