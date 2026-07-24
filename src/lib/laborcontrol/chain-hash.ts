// TypeScript reference implementation of the LaborControl chain hash
// Mirrors the Postgres function lc_canonical_payload() + SHA-256
// Used by verification tools and audit scripts — NOT for runtime insertion
// (insertion uses the BEFORE INSERT trigger on the DB side)

import { createHash } from 'crypto';

export interface ChainHashInput {
  chainSeq:          number;
  empresaId:         string;
  empleadoId:        string;
  tipo:              string;
  timestampServidor: Date;
  prevHash:          string;
}

/**
 * Replicates the canonical payload format used by the Postgres trigger:
 *   v1|chain_seq=N|empresa_id=X|empleado_id=Y|tipo=Z|ts=ISO|prev=HASH
 *
 * Returns the SHA-256 hex digest — must match chain_hash stored in lc_fichajes.
 */
export function computeChainHash(input: ChainHashInput): string {
  const payload = [
    'v1',
    `chain_seq=${input.chainSeq}`,
    `empresa_id=${input.empresaId}`,
    `empleado_id=${input.empleadoId}`,
    `tipo=${input.tipo}`,
    `ts=${input.timestampServidor.toISOString()}`,
    `prev=${input.prevHash}`,
  ].join('|');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Verify a single link in the chain.
 * Returns true if the stored hash matches the recomputed hash.
 */
export function verifyLink(row: ChainHashInput & { chainHash: string }): boolean {
  const expected = computeChainHash(row);
  return expected === row.chainHash;
}
