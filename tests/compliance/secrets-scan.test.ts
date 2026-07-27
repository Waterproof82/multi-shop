/**
 * Vitest — Secrets Scan (OWASP / Seguridad)
 *
 * Busca estáticamente en el código fuente patrones de secrets hardcodeados:
 *   1. JWTs hardcodeados (eyJ...)
 *   2. service_role key expuesta como literal
 *   3. Strings de API key (sk_, pk_)
 *   4. getTokenSecret() es función (no constante de módulo)
 *
 * Este test NO sustituye a un SAST completo — es una red de seguridad
 * rápida que detecta los errores más comunes.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../');
const SRC_DIR = resolve(ROOT, 'src');
const ELECTRON_DIR = resolve(ROOT, 'electron');

// Archivos y carpetas a excluir del scan
const EXCLUDED_PATHS = [
  'node_modules',
  '.next',
  'dist',
  '.git',
  'playwright-report',
  'test-results',
  'reports',
  'coverage',
];

const INCLUDED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);

function* walkDir(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_PATHS.some(ex => entry === ex)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* walkDir(full);
    } else if (INCLUDED_EXTENSIONS.has(extname(entry))) {
      yield full;
    }
  }
}

function getSourceFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    for (const file of walkDir(dir)) {
      files.push(file);
    }
  }
  return files;
}

// Patrones de secrets — cada uno con descripción y regex
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'JWT hardcodeado (eyJ...)',
    // Cadena que empieza con eyJ seguida de chars base64 y tiene longitud > 40
    pattern: /['"](eyJ[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{30,})['"]/,
  },
  {
    name: 'service_role key como literal',
    pattern: /['"](service_role[^'"]{10,})['"]/,
  },
  {
    name: 'Supabase anon key hardcodeada (eyJhbGciOi...)',
    pattern: /['"](eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[^'"]{10,})['"]/,
  },
  {
    name: 'Stripe secret key hardcodeada (sk_live_ o sk_test_)',
    pattern: /['"](sk_(live|test)_[A-Za-z0-9]{20,})['"]/,
  },
];

describe('Secrets Scan — no hay secrets hardcodeados en src/ y electron/', () => {
  const sourceFiles = getSourceFiles([SRC_DIR, ELECTRON_DIR]);

  it('se encontraron archivos fuente para analizar', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const { name, pattern } of SECRET_PATTERNS) {
    it(`No hay ${name} en el código fuente`, () => {
      const violations: string[] = [];

      for (const file of sourceFiles) {
        let content: string;
        try {
          content = readFileSync(file, 'utf8');
        } catch {
          continue;
        }

        const lines = content.split('\n');
        lines.forEach((line, i) => {
          // Ignorar comentarios y archivos de test
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
          if (file.includes('.test.') || file.includes('.spec.')) return;

          if (pattern.test(line)) {
            violations.push(`${file}:${i + 1} — ${line.trim().substring(0, 80)}`);
          }
        });
      }

      if (violations.length > 0) {
        console.error('Secrets detectados:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  }

  it('getTokenSecret está implementada como función (no como constante)', () => {
    const tokenSecretFiles = sourceFiles.filter(f => f.includes('getTokenSecret'));

    // Si no hay archivos con getTokenSecret, el test es irrelevante
    if (tokenSecretFiles.length === 0) return;

    for (const file of tokenSecretFiles) {
      const content = readFileSync(file, 'utf8');
      // No debe haber: const TOKEN_SECRET = process.env...
      // Debe haber: function getTokenSecret() o const getTokenSecret = () =>
      const hasConstant = /const\s+TOKEN_SECRET\s*=/.test(content);
      expect(hasConstant).toBe(false);
    }
  });
});
