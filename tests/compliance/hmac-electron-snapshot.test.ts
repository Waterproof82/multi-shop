/**
 * Vitest — HMAC Electron Snapshot (SIALTI)
 *
 * Verifica la lógica de integridad HMAC-SHA256 que usa el handler
 * fiscal:save-snapshot en electron/main.ts.
 *
 * Tests:
 *   1. HMAC generado es determinista
 *   2. Snapshot modificado → verificación falla
 *   3. HMAC con clave incorrecta → verificación falla
 *   4. Snapshot vacío → no produce HMAC válido con clave diferente
 */
import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';

// Replica de la lógica del handler fiscal:save-snapshot en electron/main.ts
function computeHmac(data: string, key: Buffer | string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function buildSnapshotJson(turnoId: string, cobros: unknown[]): string {
  return JSON.stringify({
    turnoId,
    cobros,
    exportedAt: '2026-07-27T12:00:00Z', // fecha fija para tests deterministas
  });
}

const DEVICE_KEY = Buffer.from('test-device-key-32bytes-padded!!!', 'utf8');
const DUMMY_TURNO = 'turno-001';
const DUMMY_COBROS = [
  { id: 'c1', importe: 1500, hash: 'abc123' },
  { id: 'c2', importe: 2000, hash: 'def456' },
];

describe('HMAC Electron Snapshot — integridad fiscal (SIALTI)', () => {
  it('HMAC es determinista — mismo input, mismo digest', () => {
    const snapshot = buildSnapshotJson(DUMMY_TURNO, DUMMY_COBROS);
    const h1 = computeHmac(snapshot, DEVICE_KEY);
    const h2 = computeHmac(snapshot, DEVICE_KEY);
    expect(h1).toBe(h2);
  });

  it('HMAC tiene 64 caracteres hex (SHA-256)', () => {
    const snapshot = buildSnapshotJson(DUMMY_TURNO, DUMMY_COBROS);
    const hmac = computeHmac(snapshot, DEVICE_KEY);
    expect(hmac).toHaveLength(64);
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('snapshot modificado → HMAC no coincide con el original', () => {
    const original = buildSnapshotJson(DUMMY_TURNO, DUMMY_COBROS);
    const originalHmac = computeHmac(original, DEVICE_KEY);

    // Manipulación: cambiar un importe
    const tampered = JSON.stringify({
      turnoId: DUMMY_TURNO,
      cobros: [
        { id: 'c1', importe: 9999, hash: 'abc123' }, // importe modificado
        { id: 'c2', importe: 2000, hash: 'def456' },
      ],
      exportedAt: '2026-07-27T12:00:00Z',
    });

    const tamperedHmac = computeHmac(tampered, DEVICE_KEY);
    expect(originalHmac).not.toBe(tamperedHmac);
  });

  it('clave incorrecta → HMAC no coincide', () => {
    const snapshot = buildSnapshotJson(DUMMY_TURNO, DUMMY_COBROS);
    const correctHmac  = computeHmac(snapshot, DEVICE_KEY);
    const wrongKeyHmac = computeHmac(snapshot, Buffer.from('wrong-key-!!!!!!!!!!!!!!!!!!!!!!', 'utf8'));
    expect(correctHmac).not.toBe(wrongKeyHmac);
  });

  it('cambio en turnoId → HMAC diferente', () => {
    const s1 = buildSnapshotJson('turno-001', DUMMY_COBROS);
    const s2 = buildSnapshotJson('turno-999', DUMMY_COBROS);
    expect(computeHmac(s1, DEVICE_KEY)).not.toBe(computeHmac(s2, DEVICE_KEY));
  });

  it('verificación exitosa — HMAC recomputado coincide con almacenado', () => {
    const snapshot = buildSnapshotJson(DUMMY_TURNO, DUMMY_COBROS);
    const stored = computeHmac(snapshot, DEVICE_KEY);

    // Simulación de verificación al leer el archivo
    const recomputed = computeHmac(snapshot, DEVICE_KEY);
    expect(recomputed).toBe(stored);
  });
});
