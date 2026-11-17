import { describe, expect, it } from 'vitest';
import { mapPgError } from '@/core/infrastructure/database/supabase-kit-caducidad.repository';

describe('mapPgError', () => {
  it('traduce 23503 (FK/trigger) a VALIDATION_ERROR', () => {
    const error = mapPgError({ code: '23503', message: 'fk violation' }, 'replaceCaducidades');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.module).toBe('repository');
  });

  it('traduce 23514 (CHECK, p. ej. la_una_fuente) a VALIDATION_ERROR', () => {
    const error = mapPgError({ code: '23514', message: 'check violation' }, 'replaceCaducidades');
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('traduce 23505 (código de lote duplicado) a CONFLICT', () => {
    const error = mapPgError({ code: '23505', message: 'unique violation' }, 'createLote');
    expect(error.code).toBe('CONFLICT');
  });

  it('traduce P0002 (RPC: lote no encontrado) a KIT_LOTE_NOT_FOUND', () => {
    const error = mapPgError({ code: 'P0002', message: 'no existe' }, 'replaceCaducidades');
    expect(error.code).toBe('KIT_LOTE_NOT_FOUND');
  });

  it('cualquier otro código cae en DB_ERROR, con el mensaje original', () => {
    const error = mapPgError({ code: '08006', message: 'conexión perdida' }, 'findLotes');
    expect(error.code).toBe('DB_ERROR');
    expect(error.message).toBe('conexión perdida');
  });
});
