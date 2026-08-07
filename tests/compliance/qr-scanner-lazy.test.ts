/**
 * El lector de QR debe seguir fuera del chunk inicial.
 *
 * `qr-scanner-gate` importa `@zxing/browser` → `@zxing/library`: un decodificador
 * de códigos de barras completo, ~1,4 MB de JS sin minificar. Solo se muestra
 * cuando el token de la mesa caduca o la sesión se cierra, así que el comensal
 * normal —que llega con token porque acaba de escanear el QR— nunca lo abre.
 *
 * Por eso se carga con `next/dynamic` desde `qr-scanner-gate-lazy`.
 *
 * POR QUÉ ESTE TEST EXISTE
 * El ahorro depende de una sola condición: que NADIE importe el módulo pesado de
 * forma estática. Basta un `import { QRScannerGate } from '@/components/qr-scanner-gate'`
 * en cualquier componente cliente —el autocompletado del editor ofrece los dos
 * caminos— para que el bundler lo devuelva al chunk inicial. No falla nada, no
 * avisa nadie: la página simplemente vuelve a pesar 1,4 MB más y no se entera
 * hasta que alguien mide.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SRC = resolve(__dirname, '../../src');

/** El único módulo autorizado a importar la implementación pesada. */
const ENVOLTORIO = 'components/qr-scanner-gate-lazy.tsx';
/** La implementación en sí, que obviamente contiene la ruta en su propio nombre. */
const IMPLEMENTACION = 'components/qr-scanner-gate.tsx';

function listarFuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...listarFuentes(ruta));
    } else if (/\.tsx?$/.test(entrada)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Solo import estático: `import ... from '...qr-scanner-gate'`. El dinámico
 *  (`import('...')`) es justamente lo que queremos y no debe contar. */
const IMPORT_ESTATICO = /import\s[^;]*?\sfrom\s*['"][^'"]*qr-scanner-gate['"]/s;

describe('@zxing fuera del chunk inicial', () => {
  it('solo el envoltorio lazy importa la implementación de forma estática', () => {
    const infractores = listarFuentes(SRC)
      .map((ruta) => ({ ruta, rel: relative(SRC, ruta).replaceAll('\\', '/') }))
      .filter(({ rel }) => rel !== ENVOLTORIO && rel !== IMPLEMENTACION)
      .filter(({ ruta }) => IMPORT_ESTATICO.test(readFileSync(ruta, 'utf8')))
      .map(({ rel }) => rel);

    expect(
      infractores,
      `Estos módulos importan el lector de QR de forma estática y devuelven ~1,4 MB ` +
        `de @zxing al chunk inicial. Importar desde '@/components/qr-scanner-gate-lazy':\n` +
        infractores.map((f) => `  - ${f}`).join('\n'),
    ).toEqual([]);
  });

  it('el envoltorio carga la implementación de forma diferida, no estática', () => {
    const fuente = readFileSync(join(SRC, ENVOLTORIO), 'utf8');

    // Si alguien "simplifica" el envoltorio a un re-export estático, el archivo
    // sigue existiendo, los imports de arriba siguen apuntando aquí y el test
    // anterior sigue en verde — mientras el ahorro ha desaparecido del todo.
    expect(fuente).toMatch(/import\(\s*['"][^'"]*qr-scanner-gate['"]\s*\)/);
    expect(fuente).toMatch(/ssr:\s*false/);
    expect(IMPORT_ESTATICO.test(fuente.replace(/import\s+type[^;]*;/g, ''))).toBe(false);
  });
});
