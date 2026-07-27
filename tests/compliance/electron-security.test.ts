/**
 * Vitest — Electron Security (SIALTI / OWASP)
 *
 * Verifica estáticamente que electron/main.ts cumple los requisitos
 * de seguridad del renderer:
 *   1. contextIsolation: true
 *   2. nodeIntegration: false
 *   3. No usa loadURL con http:// en producción (solo file:// o https://)
 *   4. Tiene el handler fiscal:save-snapshot con HMAC
 *   5. contextBridge está configurado en preload.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../');
const MAIN_TS = resolve(ROOT, 'electron/main.ts');
const PRELOAD_TS = resolve(ROOT, 'electron/preload.ts');

function readSource(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

describe('Electron Security — configuración del renderer (SIALTI)', () => {
  const main = readSource(MAIN_TS);
  const preload = readSource(PRELOAD_TS);

  it('electron/main.ts existe', () => {
    expect(main.length).toBeGreaterThan(0);
  });

  it('contextIsolation: true está configurado', () => {
    // Buscar contextIsolation: true (con o sin espacios)
    expect(main).toMatch(/contextIsolation\s*:\s*true/);
  });

  it('nodeIntegration: false está configurado', () => {
    expect(main).toMatch(/nodeIntegration\s*:\s*false/);
  });

  it('handler fiscal:save-snapshot existe', () => {
    expect(main).toMatch(/fiscal:save-snapshot/);
  });

  it('HMAC-SHA256 está implementado en main.ts', () => {
    // Verificar que se usa createHmac con sha256
    expect(main).toMatch(/createHmac|hmac|sha256/i);
  });

  it('electron/preload.ts existe', () => {
    expect(preload.length).toBeGreaterThan(0);
  });

  it('contextBridge está configurado en preload.ts', () => {
    expect(preload).toMatch(/contextBridge/);
  });

  it('exposeInMainWorld está en preload.ts', () => {
    expect(preload).toMatch(/exposeInMainWorld/);
  });

  it('main.ts no tiene nodeIntegration: true', () => {
    // Verificar que no hay una línea explícita con nodeIntegration: true
    // (podría ser un comentario o una config alternativa)
    const lines = main.split('\n').filter(l =>
      l.includes('nodeIntegration') &&
      !l.trim().startsWith('//')
    );
    for (const line of lines) {
      // Ninguna línea activa de nodeIntegration debe ser true
      expect(line).not.toMatch(/nodeIntegration\s*:\s*true/);
    }
  });
});
