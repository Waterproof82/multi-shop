// Números de serie de los kits de emergencia (sdd kit-expiry-reminders R3.1,
// repo kitemergenciacanarias). Formato `KEC-XXXX-XXXX-C`:
//   - 8 caracteres Crockford base32 = 40 bits de un CSPRNG (no enumerables),
//   - 1 carácter de control (suma ponderada módulo 31: detecta cualquier
//     carácter cambiado y cualquier intercambio de dos contiguos).
// Crockford no usa I, L, O ni U, así que lo que el cliente teclea mal por
// parecido (O→0, I/L→1) se corrige al normalizar.

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIJO = 'KEC';
const LONGITUD_CUERPO = 8;
const BYTES_ALEATORIOS = 5;

type GeneradorBytes = (n: number) => Uint8Array;

const bytesSeguros: GeneradorBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

function caracterDeControl(cuerpo: string): string {
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    suma += ALFABETO.indexOf(cuerpo[i]) * (i + 1);
  }
  return ALFABETO[suma % 31];
}

function formatear(cuerpo: string): string {
  return `${PREFIJO}-${cuerpo.slice(0, 4)}-${cuerpo.slice(4)}-${caracterDeControl(cuerpo)}`;
}

/** Genera una serie nueva. `aleatorio` solo se inyecta en tests. */
export function generarSerie(aleatorio: GeneradorBytes = bytesSeguros): string {
  const bytes = aleatorio(BYTES_ALEATORIOS);
  let valor = 0n;
  for (const byte of bytes) valor = (valor << 8n) | BigInt(byte);

  let cuerpo = '';
  for (let i = 0; i < LONGITUD_CUERPO; i++) {
    cuerpo = ALFABETO[Number(valor & 31n)] + cuerpo;
    valor >>= 5n;
  }
  return formatear(cuerpo);
}

/**
 * Lleva lo que escribe o escanea el cliente a la forma canónica, o `null`
 * si no tiene forma de serie. No comprueba el carácter de control.
 */
export function normalizarSerie(entrada: string): string | null {
  if (entrada.length > 40) return null;
  const limpia = entrada
    .toUpperCase()
    .replaceAll(/[\s-]/g, '')
    .replaceAll('O', '0')
    .replaceAll(/[IL]/g, '1');
  if (!limpia.startsWith(PREFIJO)) return null;
  const resto = limpia.slice(PREFIJO.length);
  if (resto.length !== LONGITUD_CUERPO + 1) return null;
  if ([...resto].some((c) => !ALFABETO.includes(c))) return null;
  return `${PREFIJO}-${resto.slice(0, 4)}-${resto.slice(4, 8)}-${resto[8]}`;
}

/** `true` si la serie tiene forma canónica y su carácter de control cuadra. */
export function esSerieValida(serie: string): boolean {
  const normal = normalizarSerie(serie);
  if (normal === null || normal !== serie) return false;
  const cuerpo = serie.slice(4, 8) + serie.slice(9, 13);
  return formatear(cuerpo) === serie;
}
