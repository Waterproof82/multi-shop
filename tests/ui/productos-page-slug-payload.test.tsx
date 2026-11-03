/**
 * product-detail-pages PR1 (tarea 1.7) — payload de slug/canonical_externo
 * y mensaje de error 409.
 *
 * `buildProductoPayload`/`getSaveErrorMessage` se extrajeron de
 * `handleSubmit` (mismo patrón que `getTiendaModalidadBadgeInfo` en la
 * página de pedidos) para poder probarlos sin montar la página admin
 * completa (useAdmin, fetch de productos/categorías/menús virtuales, etc.).
 */
import { describe, it, expect } from 'vitest';
import {
  buildProductoPayload,
  getSaveErrorMessage,
  emptyForm,
} from '@/app/admin/(protected)/productos/page';

describe('buildProductoPayload — slug y canonical_externo', () => {
  it('manda el slug recortado cuando el admin escribe uno manual', () => {
    const payload = buildProductoPayload({ ...emptyForm, titulo_es: 'Kit', slug: '  kit-basico  ' });
    expect(payload.slug).toBe('kit-basico');
  });

  it('manda null cuando el slug queda vacío (lo autogenera el backend)', () => {
    const payload = buildProductoPayload({ ...emptyForm, titulo_es: 'Kit', slug: '' });
    expect(payload.slug).toBeNull();
  });

  it('manda canonical_externo recortado o null si está vacío', () => {
    const conUrl = buildProductoPayload({ ...emptyForm, canonical_externo: ' https://example.com/kit ' });
    expect(conUrl.canonical_externo).toBe('https://example.com/kit');

    const sinUrl = buildProductoPayload({ ...emptyForm, canonical_externo: '' });
    expect(sinUrl.canonical_externo).toBeNull();
  });

  it('no rompe el mapeo de campos existentes (regresión)', () => {
    const payload = buildProductoPayload({ ...emptyForm, precio: '19.99', foto_url: '' });
    expect(payload.precio).toBe(19.99);
    expect(payload.foto_url).toBeNull();
  });
});

describe('getSaveErrorMessage — 409 amigable y traducido', () => {
  it('devuelve un mensaje traducido de conflicto para status 409, no el crudo del backend', () => {
    const msg = getSaveErrorMessage(409, 'El slug ya está en uso', 'es');
    expect(msg).toBe('Ese slug ya está en uso. Prueba con otro o déjalo vacío para generarlo automáticamente.');
  });

  it('traduce el 409 también en otros idiomas del admin', () => {
    const msg = getSaveErrorMessage(409, 'El slug ya está en uso', 'en');
    expect(msg).toBe('That slug is already in use. Try another one or leave it empty to generate it automatically.');
  });

  it('usa el mensaje del backend para otros códigos de error', () => {
    const msg = getSaveErrorMessage(400, 'Slug inválido: solo minúsculas, números y guiones', 'es');
    expect(msg).toBe('Slug inválido: solo minúsculas, números y guiones');
  });

  it('cae al mensaje genérico de guardado si el backend no manda error', () => {
    const msg = getSaveErrorMessage(500, undefined, 'es');
    expect(msg).toBe('Error al guardar');
  });
});
