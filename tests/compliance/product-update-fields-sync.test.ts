import { describe, it, expect } from 'vitest';
import {
  DIRECT_MAPPED_UPDATE_FIELDS,
  SPECIAL_CASED_UPDATE_FIELDS,
} from '@/core/infrastructure/database/SupabaseProductRepository';
import { updateProductSchema } from '@/core/application/dtos/product.dto';

/**
 * Regresión: `SupabaseProductRepository.mapUpdateProductPayload` solo copia
 * al UPDATE los campos listados en DIRECT_MAPPED_UPDATE_FIELDS (1:1) y
 * SPECIAL_CASED_UPDATE_FIELDS (con transformación propia, p. ej.
 * emptyStringToNull). Si un campo nuevo se añade a `updateProductSchema`
 * (product.dto.ts) sin añadirse a una de esas dos listas, el UPDATE lo
 * descarta en silencio — el cliente puede enviarlo, pasa la validación Zod,
 * pero la columna nunca cambia en BD.
 *
 * `id` no se mapea (identifica la fila, va en el `.eq('id', id)` del
 * UPDATE, nunca en el payload) y `empresaId` tampoco (aislamiento de
 * tenant, nunca escribible por el cliente) — ambos se excluyen a propósito
 * de la comparación.
 */
describe('mapUpdateProductPayload field coverage vs updateProductSchema', () => {
  it('no tiene campos duplicados entre las dos listas de mapeo', () => {
    const direct = new Set<string>(DIRECT_MAPPED_UPDATE_FIELDS);
    const special: readonly string[] = SPECIAL_CASED_UPDATE_FIELDS;
    const overlap = special.filter((field) => direct.has(field));
    expect(overlap).toEqual([]);
  });

  it('cubre exactamente las claves de updateProductSchema (sin id/empresaId)', () => {
    const mappedFields = [...DIRECT_MAPPED_UPDATE_FIELDS, ...SPECIAL_CASED_UPDATE_FIELDS].sort();

    const schemaFields = Object.keys(updateProductSchema.shape)
      .filter((key) => key !== 'id' && key !== 'empresaId')
      .sort();

    expect(mappedFields).toEqual(schemaFields);
  });
});
