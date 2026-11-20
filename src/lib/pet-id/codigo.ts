// src/lib/pet-id/codigo.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// R-QR.2.1/DD2: el código de chapa reutiliza `crearFormatoCodigo` de
// `kit-caducidad/serie.ts` con el prefijo `M` (`M-XXXX-XXXX-C`), en vez de
// copiar el mecanismo. Al tener un prefijo distinto del de los kits
// (`KEC`), un código de mascota nunca se confunde con una serie de kit:
// ninguno es válido con el formato del otro.
import { crearFormatoCodigo } from '@/lib/kit-caducidad/serie';

const FORMATO_CHAPA = crearFormatoCodigo('M');

/** Genera un código de chapa nuevo. `aleatorio` solo se inyecta en tests. */
export function generarCodigoChapa(aleatorio?: Parameters<typeof FORMATO_CHAPA.generar>[0]): string {
  return FORMATO_CHAPA.generar(aleatorio);
}

/**
 * Lleva lo que escribe o escanea quien encuentra a la mascota a la forma
 * canónica, o `null` si no tiene forma de código de chapa. No comprueba el
 * carácter de control.
 */
export function normalizarCodigoChapa(entrada: string): string | null {
  return FORMATO_CHAPA.normalizar(entrada);
}

/** `true` si el código tiene forma canónica y su carácter de control cuadra. */
export function esCodigoChapaValido(codigo: string): boolean {
  return FORMATO_CHAPA.esValido(codigo);
}
