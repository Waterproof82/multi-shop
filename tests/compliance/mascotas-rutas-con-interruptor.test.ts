/**
 * Vitest — toda ruta de `/api/admin/mascotas/**` pasa por
 * `resolveMascotasAdminContext` (calco de `kits-rutas-con-interruptor.test.ts`,
 * DD12 de design.md).
 *
 * El flag y la puerta (`resolveMascotasAdminContext`) nacen en PR4, pero las
 * primeras rutas de `/api/admin/mascotas/**` no llegan hasta PR5/PR6. Este
 * test escanea el árbol de ficheros en vez de invocar cada handler, así que
 * YA vigila la carpeta ahora: en cuanto PR5/PR6 añadan la primera ruta,
 * `it.each` empieza a cubrirla sin que nadie tenga que acordarse de ampliar
 * una lista a mano — ni de crear este fichero de nuevo.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const MASCOTAS_API_DIR = resolve(__dirname, '../../src/app/api/admin/mascotas');

function* walkDir(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* walkDir(full);
    } else if (entry === 'route.ts') {
      yield full;
    }
  }
}

const routeFiles = Array.from(walkDir(MASCOTAS_API_DIR));

describe('toda ruta de /api/admin/mascotas/** usa resolveMascotasAdminContext (DD12)', () => {
  it('la carpeta vigilada es la correcta (aunque aún no tenga rutas — llegan en PR5/PR6)', () => {
    expect(MASCOTAS_API_DIR.replace(/\\/g, '/')).toMatch(/src\/app\/api\/admin\/mascotas$/);
    expect(existsSync(MASCOTAS_API_DIR)).toBe(false);
  });

  it.each(routeFiles)('%s llama a resolveMascotasAdminContext', (file) => {
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('resolveMascotasAdminContext');
  });
});
