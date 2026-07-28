/**
 * Vitest + fast-check — Hash Property Tests (RD 1007/2023 / RD-Ley 8/2019)
 *
 * Propiedades invariantes del hash SHA-256 del payload canónico:
 *   P1. SHA-256 es determinista — mismo input, mismo hash (para todo string)
 *   P2. SHA-256 siempre produce 64 hex chars
 *   P3. Inputs distintos (casi siempre) producen hashes distintos
 *   P4. El campo prev_hash en el payload conecta la cadena
 */
import { createHash } from 'node:crypto';
import { describe, it } from 'vitest';
import * as fc from 'fast-check';

function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

describe('Hash Property Tests — fast-check (SHA-256)', () => {
  it('P1: SHA-256 es determinista para todo string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return sha256hex(s) === sha256hex(s);
      }),
      { numRuns: 1000 }
    );
  });

  it('P2: SHA-256 siempre produce exactamente 64 hex chars', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = sha256hex(s);
        return h.length === 64 && /^[0-9a-f]{64}$/.test(h);
      }),
      { numRuns: 1000 }
    );
  });

  it('P3: inputs distintos producen hashes distintos (collision resistance)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (s1, s2) => {
        // Solo testear cuando son distintos (trivialmente)
        fc.pre(s1 !== s2);
        return sha256hex(s1) !== sha256hex(s2);
      }),
      { numRuns: 1000 }
    );
  });

  it('P4: encadenamiento — hash con prev_hash distinto produce output distinto', () => {
    fc.assert(
      fc.property(
        fc.record({
          empresaId:   fc.uuid(),
          empleadoId:  fc.uuid(),
          tipo:        fc.constantFrom('entrada', 'salida'),
          timestamp:   fc.integer({ min: 0, max: 4102444800000 }).map(ms => new Date(ms).toISOString()),
        }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (fields, prevHash1, prevHash2) => {
          fc.pre(prevHash1 !== prevHash2);

          const buildPayload = (prevHash: string) =>
            `v1|empresa_id=${fields.empresaId}|empleado_id=${fields.empleadoId}|tipo=${fields.tipo}|timestamp=${fields.timestamp}|prev_hash=${prevHash}`;

          return sha256hex(buildPayload(prevHash1)) !== sha256hex(buildPayload(prevHash2));
        }
      ),
      { numRuns: 500 }
    );
  });
});
