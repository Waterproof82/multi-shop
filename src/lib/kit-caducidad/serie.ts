// Números de serie de los kits de emergencia (sdd kit-expiry-reminders R3.1,
// repo kitemergenciacanarias). Formato `KEC-XXXX-XXXX-C`:
//   - 8 caracteres Crockford base32 = 40 bits de un CSPRNG (no enumerables),
//   - 1 carácter de control (suma ponderada módulo 31: detecta cualquier
//     carácter cambiado y cualquier intercambio de dos contiguos).
// Crockford no usa I, L, O ni U, así que lo que el cliente teclea mal por
// parecido (O→0, I/L→1) se corrige al normalizar.
//
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// DD2: `crearFormatoCodigo(prefijo)` generaliza este mecanismo para que las
// chapas de mascota (prefijo `M`) lo reutilicen sin colisionar con las
// series de kit (prefijo `KEC`). `generarSerie`, `normalizarSerie` y
// `esSerieValida` quedan como antes (misma firma, mismo comportamiento):
// por debajo solo delegan en la fábrica ligada a `KEC`. Los desplazamientos
// de `esValido` ya no están fijos (antes `slice(4, 8)` asumía el prefijo
// `KEC`): se calculan a partir de `prefijo.length`.

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
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

export interface FormatoCodigo {
  generar(aleatorio?: GeneradorBytes): string;
  normalizar(entrada: string): string | null;
  esValido(codigo: string): boolean;
}

/**
 * Fábrica del formato `PREFIJO-XXXX-XXXX-C` (DD2 de pet-id-qr-profile):
 * genera, normaliza y valida códigos para un `prefijo` dado. Dos prefijos
 * distintos nunca colisionan entre sí porque `normalizar` exige que la
 * entrada empiece exactamente por el prefijo de ESTA fábrica.
 *
 * @public — consumida por `src/lib/pet-id/codigo.ts` (prefijo `M`) y, en
 * este mismo fichero, por las funciones ligadas a `KEC`.
 */
export function crearFormatoCodigo(prefijo: string): FormatoCodigo {
  function formatear(cuerpo: string): string {
    return `${prefijo}-${cuerpo.slice(0, 4)}-${cuerpo.slice(4)}-${caracterDeControl(cuerpo)}`;
  }

  function generar(aleatorio: GeneradorBytes = bytesSeguros): string {
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

  function normalizar(entrada: string): string | null {
    if (entrada.length > 40) return null;
    const limpia = entrada
      .toUpperCase()
      .replaceAll(/[\s-]/g, '')
      .replaceAll('O', '0')
      .replaceAll(/[IL]/g, '1');
    if (!limpia.startsWith(prefijo)) return null;
    const resto = limpia.slice(prefijo.length);
    if (resto.length !== LONGITUD_CUERPO + 1) return null;
    if ([...resto].some((c) => !ALFABETO.includes(c))) return null;
    return `${prefijo}-${resto.slice(0, 4)}-${resto.slice(4, 8)}-${resto[8]}`;
  }

  function esValido(codigo: string): boolean {
    const normal = normalizar(codigo);
    if (normal === null || normal !== codigo) return false;
    const inicioCuerpo = prefijo.length + 1;
    const cuerpo = codigo.slice(inicioCuerpo, inicioCuerpo + 4) + codigo.slice(inicioCuerpo + 5, inicioCuerpo + 9);
    return formatear(cuerpo) === codigo;
  }

  return { generar, normalizar, esValido };
}

const FORMATO_KEC = crearFormatoCodigo('KEC');

/** Genera una serie nueva. `aleatorio` solo se inyecta en tests. */
export function generarSerie(aleatorio?: GeneradorBytes): string {
  return FORMATO_KEC.generar(aleatorio);
}

/**
 * Lleva lo que escribe o escanea el cliente a la forma canónica, o `null`
 * si no tiene forma de serie. No comprueba el carácter de control.
 */
export function normalizarSerie(entrada: string): string | null {
  return FORMATO_KEC.normalizar(entrada);
}

/** `true` si la serie tiene forma canónica y su carácter de control cuadra. */
export function esSerieValida(serie: string): boolean {
  return FORMATO_KEC.esValido(serie);
}
