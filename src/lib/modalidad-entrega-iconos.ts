/**
 * Iconos disponibles para una modalidad de entrega (recogida/domicilio).
 * Única fuente de verdad — la usan tanto el formulario de admin
 * (ModalidadesEntregaForm) como el selector del carrito
 * (TiendaFulfillmentSelector). El valor guardado en DB (columna `icono`) es
 * el `value` de este array, nunca el emoji directo.
 */
export const ICONOS_MODALIDAD_ENTREGA = [
  { value: 'store', emoji: '🏪', labelKey: 'deliveryModalityIconStore' },
  { value: 'bike', emoji: '🚲', labelKey: 'deliveryModalityIconBike' },
  { value: 'car', emoji: '🚗', labelKey: 'deliveryModalityIconCar' },
  { value: 'package', emoji: '📦', labelKey: 'deliveryModalityIconPackage' },
  { value: 'clock', emoji: '⏱️', labelKey: 'deliveryModalityIconClock' },
] as const;

/** Emoji para una clave de icono. Cadena vacía si la clave no es conocida. */
export function emojiDeIcono(icono: string): string {
  return ICONOS_MODALIDAD_ENTREGA.find((i) => i.value === icono)?.emoji ?? '';
}
