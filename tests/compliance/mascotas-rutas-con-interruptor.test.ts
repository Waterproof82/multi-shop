/**
 * Vitest — toda ruta de `/api/admin/mascotas/**` pasa por
 * `resolveMascotasAdminContext` (calco de `kits-rutas-con-interruptor.test.ts`,
 * DD12 de design.md).
 *
 * El flag y la puerta (`resolveMascotasAdminContext`) nacieron en PR4; PR5
 * añade las primeras rutas (`lotes`, `lotes/[id]/chapas`) y PR6 añadirá el
 * borrado auditado. Este test escanea el árbol de ficheros en vez de invocar
 * cada handler, así que sigue vigilando la carpeta completa: cualquier ruta
 * nueva que PR6+ añada bajo `api/admin/mascotas/**` queda cubierta por
 * `it.each` sin tocar este fichero.
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
  it('la carpeta vigilada es la correcta y ya tiene rutas (desde PR5)', () => {
    expect(MASCOTAS_API_DIR.replace(/\\/g, '/')).toMatch(/src\/app\/api\/admin\/mascotas$/);
    expect(existsSync(MASCOTAS_API_DIR)).toBe(true);
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)('%s llama a resolveMascotasAdminContext', (file) => {
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('resolveMascotasAdminContext');
  });
});
