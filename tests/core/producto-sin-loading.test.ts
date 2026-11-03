/**
 * F7 (design): un `loading.tsx` bajo /producto/[slug] montaría un Suspense
 * shell que SE PINTA (200) antes de que `notFound()`/`permanentRedirect()`
 * corran, convirtiendo un 404/308 real en un 200 con el fallback. Confirmado
 * ya en PR0 (tarea 0.6, la ruta no existía todavía); este test lo fija ahora
 * que la ruta SÍ existe, para que nadie lo añada sin querer más adelante.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('src/app/producto/[slug] — sin loading.tsx', () => {
  it('no existe loading.tsx: evitaría que notFound()/permanentRedirect() lleguen a aplicarse', () => {
    const loadingPath = join(process.cwd(), 'src', 'app', 'producto', '[slug]', 'loading.tsx');
    expect(existsSync(loadingPath)).toBe(false);
  });
});
