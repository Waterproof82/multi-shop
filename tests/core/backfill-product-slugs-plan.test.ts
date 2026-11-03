/**
 * Lógica pura de planificación del backfill de slugs (product-detail-pages
 * PR2c — tarea 2.7). `planificarSlugs` no toca Supabase: recibe los
 * productos pendientes (slug IS NULL) y los slugs ya ocupados por empresa, y
 * devuelve la lista de (empresaId, productoId, slug) a escribir. El propio
 * script (`scripts/backfill-product-slugs.ts`) solo hace I/O alrededor de
 * esto.
 */
import { describe, it, expect } from 'vitest';
import { planificarSlugs } from '../../scripts/backfill-product-slugs';

describe('planificarSlugs', () => {
  it('aplica slugify (acentos, ñ) al título', () => {
    const planificado = planificarSlugs(
      [{ id: 'p1', empresaId: 'e1', titulo: 'Café con Leña' }],
      new Map(),
    );
    expect(planificado).toEqual([{ empresaId: 'e1', productoId: 'p1', slug: 'cafe-con-lena' }]);
  });

  it('resuelve colisiones dentro de la misma empresa con sufijo -2, -3...', () => {
    const planificado = planificarSlugs(
      [
        { id: 'p1', empresaId: 'e1', titulo: 'Pan' },
        { id: 'p2', empresaId: 'e1', titulo: 'Pan' },
        { id: 'p3', empresaId: 'e1', titulo: 'Pan' },
      ],
      new Map(),
    );
    expect(planificado).toEqual([
      { empresaId: 'e1', productoId: 'p1', slug: 'pan' },
      { empresaId: 'e1', productoId: 'p2', slug: 'pan-2' },
      { empresaId: 'e1', productoId: 'p3', slug: 'pan-3' },
    ]);
  });

  it('el mismo slug no colisiona entre empresas distintas', () => {
    const planificado = planificarSlugs(
      [
        { id: 'p1', empresaId: 'e1', titulo: 'Pan' },
        { id: 'p2', empresaId: 'e2', titulo: 'Pan' },
      ],
      new Map(),
    );
    expect(planificado).toEqual([
      { empresaId: 'e1', productoId: 'p1', slug: 'pan' },
      { empresaId: 'e2', productoId: 'p2', slug: 'pan' },
    ]);
  });

  it('respeta los slugs ya ocupados (no los reescribe ni colisiona con ellos)', () => {
    const ocupados = new Map([['e1', new Set(['pan'])]]);
    const planificado = planificarSlugs(
      [{ id: 'p2', empresaId: 'e1', titulo: 'Pan' }],
      ocupados,
    );
    expect(planificado).toEqual([{ empresaId: 'e1', productoId: 'p2', slug: 'pan-2' }]);
    // El set de entrada no se muta: el caller puede reutilizarlo.
    expect(ocupados.get('e1')).toEqual(new Set(['pan']));
  });

  it('títulos solo-emoji caen al fallback "producto" y también resuelven colisión', () => {
    const planificado = planificarSlugs(
      [
        { id: 'p1', empresaId: 'e1', titulo: '🎉🎉🎉' },
        { id: 'p2', empresaId: 'e1', titulo: '🔥' },
      ],
      new Map(),
    );
    expect(planificado).toEqual([
      { empresaId: 'e1', productoId: 'p1', slug: 'producto' },
      { empresaId: 'e1', productoId: 'p2', slug: 'producto-2' },
    ]);
  });
});
