/**
 * Vitest — Hash Chaining (RD 1007/2023 / SIALTI / RD-Ley 8/2019)
 *
 * Verifica la estructura del payload canónico para SHA-256:
 *   1. El formato v1|campo=valor|... es determinista
 *   2. Los campos obligatorios están presentes
 *   3. Dos payloads con los mismos inputs producen el mismo hash (determinismo)
 *   4. Un cambio en cualquier campo produce un hash diferente (sensibilidad)
 */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';

// Replica del formato canónico de lc_canonical_payload() en SQL
// El orden de campos DEBE coincidir con la función SQL para que los hashes sean comparables.
function buildCanonicalPayload(params: {
  recordId: string;
  empresaId: string;
  centroId: string;
  empleadoId: string;
  actorId: string | null;
  tipo: string;
  accion: string;
  refCorreccion: string | null;
  timestampEvento: string;
  timestampServidor: string;
  motivo: string;
  prevHash: string;
}): string {
  const motivoSha256 = createHash('sha256').update(params.motivo).digest('hex');

  return [
    `v1`,
    `empresa_id=${params.empresaId}`,
    `centro_id=${params.centroId}`,
    `empleado_id=${params.empleadoId}`,
    `actor_id=${params.actorId ?? 'NULL'}`,
    `tipo=${params.tipo}`,
    `accion=${params.accion}`,
    `ref_correccion=${params.refCorreccion ?? 'NULL'}`,
    `timestamp_evento=${params.timestampEvento}`,
    `timestamp_servidor=${params.timestampServidor}`,
    `motivo_sha256=${motivoSha256}`,
    `prev_hash=${params.prevHash}`,
  ].join('|');
}

function sha256hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

const BASE_PARAMS = {
  recordId:          '11111111-1111-1111-1111-111111111111',
  empresaId:         '22222222-2222-2222-2222-222222222222',
  centroId:          '33333333-3333-3333-3333-333333333333',
  empleadoId:        '44444444-4444-4444-4444-444444444444',
  actorId:           null,
  tipo:              'entrada',
  accion:            'fichaje_entrada',
  refCorreccion:     null,
  timestampEvento:   '2026-07-27T10:00:00Z',
  timestampServidor: '2026-07-27T10:00:01Z',
  motivo:            'llegada normal',
  prevHash:          'SEGMENT_GENESIS',
};

describe('Hash Chaining — payload canónico (RD-Ley 8/2019)', () => {
  it('payload empieza con "v1|"', () => {
    const payload = buildCanonicalPayload(BASE_PARAMS);
    expect(payload).toMatch(/^v1\|/);
  });

  it('payload contiene todos los campos obligatorios', () => {
    const payload = buildCanonicalPayload(BASE_PARAMS);
    expect(payload).toContain('empresa_id=');
    expect(payload).toContain('empleado_id=');
    expect(payload).toContain('tipo=');
    expect(payload).toContain('accion=');
    expect(payload).toContain('motivo_sha256=');
    expect(payload).toContain('prev_hash=');
  });

  it('SHA-256 es determinista — mismo input, mismo hash', () => {
    const p1 = buildCanonicalPayload(BASE_PARAMS);
    const p2 = buildCanonicalPayload(BASE_PARAMS);
    expect(sha256hex(p1)).toBe(sha256hex(p2));
  });

  it('cambio en empresa_id produce hash diferente', () => {
    const p1 = sha256hex(buildCanonicalPayload(BASE_PARAMS));
    const p2 = sha256hex(buildCanonicalPayload({
      ...BASE_PARAMS,
      empresaId: '99999999-9999-9999-9999-999999999999',
    }));
    expect(p1).not.toBe(p2);
  });

  it('cambio en motivo produce hash diferente (sensibilidad a contenido)', () => {
    const p1 = sha256hex(buildCanonicalPayload(BASE_PARAMS));
    const p2 = sha256hex(buildCanonicalPayload({
      ...BASE_PARAMS,
      motivo: 'motivo manipulado',
    }));
    expect(p1).not.toBe(p2);
  });

  it('cambio en prev_hash produce hash diferente (cadena encadenada)', () => {
    const p1 = sha256hex(buildCanonicalPayload(BASE_PARAMS));
    const p2 = sha256hex(buildCanonicalPayload({
      ...BASE_PARAMS,
      prevHash: 'abc123falsehash',
    }));
    expect(p1).not.toBe(p2);
  });

  it('actor_id NULL se serializa como "NULL" en el payload', () => {
    const payload = buildCanonicalPayload({ ...BASE_PARAMS, actorId: null });
    expect(payload).toContain('actor_id=NULL');
  });

  it('actor_id con valor se serializa correctamente', () => {
    const payload = buildCanonicalPayload({ ...BASE_PARAMS, actorId: '55555555-5555-5555-5555-555555555555' });
    expect(payload).toContain('actor_id=55555555-5555-5555-5555-555555555555');
  });

  it('hash tiene 64 caracteres hex (SHA-256 correcto)', () => {
    const hash = sha256hex(buildCanonicalPayload(BASE_PARAMS));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
