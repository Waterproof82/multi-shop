/**
 * Vitest — CRON_SECRET debe compararse en tiempo constante (OWASP A07)
 *
 * Historial: rgpd-purge, laborcontrol/cron/seal y laborcontrol/cron/partition
 * comparaban el header Authorization contra CRON_SECRET con `!==`, una
 * comparación de string normal que filtra timing information proporcional a
 * los bytes que coinciden. Se corrigió centralizando la verificación en
 * src/lib/cron-auth.ts::verifyCronSecret(), que usa timingSafeEqual — el mismo
 * patrón que ya se usaba para CSRF/JWT en proxy.ts.
 *
 * Este test evita que un endpoint cron nuevo reintroduzca la comparación
 * insegura en vez de usar el helper compartido.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../');
const API_DIR = resolve(ROOT, 'src/app/api');

const EXCLUDED_PATHS = ['node_modules', '.next', 'dist', '.git'];

function* walkDir(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_PATHS.includes(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* walkDir(full);
    } else if (extname(entry) === '.ts') {
      yield full;
    }
  }
}

describe('CRON_SECRET — comparación en tiempo constante', () => {
  const routeFiles = [...walkDir(API_DIR)];

  it('se encontraron rutas API para analizar', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it('ningún endpoint cron compara CRON_SECRET con !== (debe usar verifyCronSecret)', () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = readFileSync(file, 'utf8');
      if (!content.includes('CRON_SECRET')) continue;

      const usesSharedHelper = content.includes('verifyCronSecret');
      const hasUnsafeComparison = /authHeader\s*!==\s*`Bearer/.test(content);

      if (hasUnsafeComparison && !usesSharedHelper) {
        violations.push(file);
      }
    }

    if (violations.length > 0) {
      console.error(
        'Endpoints con comparación insegura de CRON_SECRET:\n' +
          violations.join('\n') +
          '\n\nUsar verifyCronSecret() de src/lib/cron-auth.ts en su lugar.'
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('todo archivo route.ts que usa CRON_SECRET importa verifyCronSecret', () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = readFileSync(file, 'utf8');
      if (!content.includes('process.env.CRON_SECRET')) continue;
      if (!content.includes('verifyCronSecret')) {
        violations.push(file);
      }
    }

    if (violations.length > 0) {
      console.error(
        'Endpoints que leen CRON_SECRET directamente sin pasar por el helper:\n' +
          violations.join('\n')
      );
    }
    expect(violations).toHaveLength(0);
  });
});
