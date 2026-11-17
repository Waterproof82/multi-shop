/**
 * Vitest — toda ruta de `/api/admin/kits/**` pasa por `resolveKitsAdminContext`.
 *
 * R-M4.1.4: cada ruta bajo /api/admin/kits/* (lotes, lotes/[id]/caducidades,
 * lotes/[id]/series, registrados, candidatas) MUST comprobar el flag en el
 * servidor, no solo esconder la UI. `resolveKitsAdminContext` (DD1) es el
 * único sitio que hace esa comprobación correctamente (empresa OBJETIVO del
 * superadmin, no un privilegio implícito del rol — R-M4.1.5).
 *
 * Este test escanea el árbol de ficheros en vez de invocar cada handler: así
 * cubre también las rutas que M4c/M4d añadan más adelante sin que nadie
 * tenga que acordarse de ampliar una lista a mano.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const KITS_API_DIR = resolve(__dirname, '../../src/app/api/admin/kits');

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

const routeFiles = Array.from(walkDir(KITS_API_DIR));

describe('toda ruta de /api/admin/kits/** usa resolveKitsAdminContext (R-M4.1.4)', () => {
  it('se encontraron rutas de kits para analizar', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)('%s llama a resolveKitsAdminContext', (file) => {
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('resolveKitsAdminContext');
  });
});
