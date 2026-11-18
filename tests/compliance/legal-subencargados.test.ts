import { describe, it, expect } from 'vitest';
import { subencargadosDe } from '@/lib/legal/subencargados';
import { categoriasDatosDe } from '@/lib/legal/categorias-datos';
import type { FlagsLegales } from '@/core/domain/entities/empresa-legal';

const nada: FlagsLegales = {
  deliveryHabilitado: false,
  envioDomicilioHabilitado: false,
  descuentoBienvenidaActivo: false,
  pagoTarjetaActivo: false,
  tpvHabilitado: true,
  kitsCaducidadHabilitado: false,
};

const proveedores = (f: FlagsLegales) => subencargadosDe(f).map((s) => s.proveedor);

describe('subencargadosDe', () => {
  it('sin nada activo: Supabase, Vercel, Cloudflare (imágenes y copias), Brevo y Sentry', () => {
    expect(proveedores(nada)).toEqual(['Supabase (Irlanda)', 'Vercel Inc.', 'Cloudflare Inc.', 'Brevo (Francia)', 'Sentry (EE.UU.)']);
  });

  it('Redsys solo con pago con tarjeta', () => {
    expect(proveedores(nada)).not.toContain('Redsys (España)');
    expect(proveedores({ ...nada, pagoTarjetaActivo: true })).toContain('Redsys (España)');
  });

  it('Glovo solo con reparto de restaurante', () => {
    expect(proveedores(nada)).not.toContain('Glovo App S.L. (España)');
    expect(proveedores({ ...nada, deliveryHabilitado: true })).toContain('Glovo App S.L. (España)');
  });

  it('Brevo: finalidad mínima es la confirmación de pedidos', () => {
    const brevo = subencargadosDe(nada).find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos');
  });

  it('Brevo: añade seguimiento de envíos y promociones según flags', () => {
    const brevo = subencargadosDe({ ...nada, envioDomicilioHabilitado: true, descuentoBienvenidaActivo: true })
      .find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos, seguimiento de envíos y promociones');
  });

  it('Brevo: dos finalidades se unen con "y"', () => {
    const brevo = subencargadosDe({ ...nada, descuentoBienvenidaActivo: true }).find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos y promociones');
  });

  it('Brevo: añade avisos de caducidad de kits cuando el módulo está activo', () => {
    const brevo = subencargadosDe({ ...nada, kitsCaducidadHabilitado: true }).find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).toBe('Envío de emails de confirmación de pedidos y avisos de caducidad de kits');
  });

  it('Brevo: sin el módulo de kits no menciona avisos de caducidad', () => {
    const brevo = subencargadosDe(nada).find((s) => s.proveedor.startsWith('Brevo'));
    expect(brevo?.finalidad).not.toMatch(/caducidad/);
  });
});

describe('subencargadosDe — Sentry', () => {
  it('declara la grabación enmascarada de la sesión cuando hay un error (replaysOnErrorSampleRate)', () => {
    const sentry = subencargadosDe(nada).find((s) => s.proveedor.startsWith('Sentry'));
    expect(sentry?.finalidad).toMatch(/grabación enmascarada/);
  });
});

describe('categoriasDatosDe', () => {
  const titulos = (f: FlagsLegales) => categoriasDatosDe(f).map((c) => c.titulo);

  it('sin entrega a domicilio no declara dirección', () => {
    expect(titulos(nada)).not.toContain('Datos de dirección');
  });

  it('con reparto o con envío declara la dirección', () => {
    expect(titulos({ ...nada, deliveryHabilitado: true })).toContain('Datos de dirección');
    expect(titulos({ ...nada, envioDomicilioHabilitado: true })).toContain('Datos de dirección');
  });

  it('siempre declara identificativos, contacto y económicos', () => {
    expect(titulos(nada)).toEqual(['Datos identificativos', 'Datos de contacto', 'Datos económicos']);
  });

  it('sin el módulo de kits no declara los datos de los avisos de caducidad', () => {
    expect(titulos(nada)).not.toContain('Datos de avisos de caducidad del kit');
  });

  it('con el módulo de kits declara email, teléfono opcional, serie y consentimiento', () => {
    const cat = categoriasDatosDe({ ...nada, kitsCaducidadHabilitado: true }).find((c) => c.titulo === 'Datos de avisos de caducidad del kit');
    expect(cat).toBeDefined();
    expect(cat?.descripcion).toMatch(/email/i);
    expect(cat?.descripcion).toMatch(/teléfono/i);
    expect(cat?.descripcion).toMatch(/serie del kit/i);
    expect(cat?.descripcion).toMatch(/fecha y la versión/i);
  });
});
