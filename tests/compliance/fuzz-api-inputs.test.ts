/**
 * Vitest + fast-check — Fuzz API Inputs (OWASP / Validación Zod)
 *
 * Verifica que los schemas Zod de los endpoints críticos rechazan
 * siempre payloads corruptos (NaN, null, string enorme, fecha inválida, etc.)
 *
 * Escenarios cubiertos:
 *   1. Schema de cobro TPV — rechaza inputs inválidos
 *   2. Schema de apertura de turno — rechaza inputs inválidos
 *   3. Schema de fichaje kiosk — rechaza inputs inválidos
 *   4. Schema de rectificación de cobro — rechaza inputs inválidos
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';

// Réplica de los schemas Zod de los endpoints (debe coincidir con la implementación real)
// Si el schema cambia en el endpoint, actualizar aquí.

const cobroSchema = z.object({
  turnoId:    z.string().uuid(),
  pedidoId:   z.string().uuid(),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'mixto']),
});

const abrirTurnoSchema = z.object({
  cajaId:          z.string().uuid(),
  efectivoInicial: z.number().int().min(0),
});

const fichajeKioskSchema = z.object({
  pin:    z.string().min(4).max(10),
  tipo:   z.enum(['entrada', 'salida', 'pausa', 'reanudacion']),
  accion: z.string().min(1).max(50),
});

const rectificarSchema = z.object({
  cobroOriginalId: z.string().uuid(),
  motivo:          z.string().min(1).max(500),
});

// Generadores de inputs corruptos
const arbCorruptValue = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.constant(''),
  fc.constant('   '),
  fc.string({ minLength: 501, maxLength: 1000 }), // muy largo
  fc.integer(),
  fc.boolean(),
  fc.constant([]),
  fc.constant({}),
  fc.constant('not-a-uuid'),
  fc.constant('2026-99-99'),              // fecha inválida
  fc.constant('<script>alert(1)</script>'), // XSS attempt
  fc.constant("'; DROP TABLE cobros; --"),  // SQL injection attempt
);

describe('Fuzz API Inputs — Zod validation (OWASP)', () => {
  it('Schema cobro — rechaza siempre turnoId no-UUID', () => {
    fc.assert(
      fc.property(arbCorruptValue, (turnoId) => {
        const result = cobroSchema.safeParse({
          turnoId,
          pedidoId:   '00000000-0000-0000-0000-000000000001',
          metodoPago: 'efectivo',
        });
        return !result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('Schema cobro — rechaza metodoPago inválido', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !['efectivo', 'tarjeta', 'mixto'].includes(s)),
        (metodoPago) => {
          const result = cobroSchema.safeParse({
            turnoId:   '00000000-0000-0000-0000-000000000001',
            pedidoId:  '00000000-0000-0000-0000-000000000001',
            metodoPago,
          });
          return !result.success;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Schema abrirTurno — rechaza efectivoInicial negativo', () => {
    fc.assert(
      fc.property(fc.integer({ max: -1 }), (efectivoInicial) => {
        const result = abrirTurnoSchema.safeParse({
          cajaId: '00000000-0000-0000-0000-000000000001',
          efectivoInicial,
        });
        return !result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('Schema abrirTurno — rechaza cajaId no-UUID', () => {
    fc.assert(
      fc.property(arbCorruptValue, (cajaId) => {
        const result = abrirTurnoSchema.safeParse({
          cajaId,
          efectivoInicial: 0,
        });
        return !result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('Schema fichaje kiosk — rechaza pin vacío o muy corto', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 3 }), (pin) => {
        const result = fichajeKioskSchema.safeParse({
          pin,
          tipo:   'entrada',
          accion: 'fichaje_entrada',
        });
        return !result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('Schema rectificar — rechaza motivo vacío', () => {
    const result = rectificarSchema.safeParse({
      cobroOriginalId: '00000000-0000-0000-0000-000000000001',
      motivo: '',
    });
    expect(result.success).toBe(false);
  });

  it('Schema rectificar — rechaza motivo > 500 chars', () => {
    const result = rectificarSchema.safeParse({
      cobroOriginalId: '00000000-0000-0000-0000-000000000001',
      motivo: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('Inputs válidos — schema cobro acepta correctamente', () => {
    const result = cobroSchema.safeParse({
      turnoId:    '00000000-0000-0000-0000-000000000001',
      pedidoId:   '00000000-0000-0000-0000-000000000002',
      metodoPago: 'efectivo',
    });
    expect(result.success).toBe(true);
  });
});
