/**
 * Número de seguimiento de envíos a domicilio + email al cliente.
 *
 * POR QUÉ ESTE TEST EXISTE
 * El email sale firmado con el nombre de la tienda y lleva datos que escribe el
 * admin (número de seguimiento) y el cliente (nombre, dirección, complementos).
 * Cualquiera de ellos sin escapar es inyección de HTML en un correo real.
 *
 * Y la regla de quién puede tener seguimiento decide qué botón ve el admin: un
 * pedido de recogida o de mesa con número de seguimiento no tiene sentido, y un
 * pedido cancelado no se envía.
 */
import { describe, it, expect } from 'vitest';
import { puedeTenerSeguimiento } from '../../src/core/domain/constants/pedido';
import {
  construirEmailSeguimiento,
  type DatosEmailSeguimiento,
} from '../../src/core/infrastructure/services/seguimiento-email.builder';

describe('puedeTenerSeguimiento', () => {
  it('acepta un envío a domicilio activo', () => {
    expect(puedeTenerSeguimiento({ modalidad_entrega_tipo: 'domicilio', estado: 'pendiente' })).toBe(true);
    expect(puedeTenerSeguimiento({ modalidad_entrega_tipo: 'domicilio', estado: 'enviado' })).toBe(true);
  });

  it('rechaza recogida, pedidos sin modalidad y cancelados', () => {
    expect(puedeTenerSeguimiento({ modalidad_entrega_tipo: 'recogida', estado: 'pendiente' })).toBe(false);
    expect(puedeTenerSeguimiento({ modalidad_entrega_tipo: null, estado: 'pendiente' })).toBe(false);
    expect(puedeTenerSeguimiento({ modalidad_entrega_tipo: undefined, estado: 'pendiente' })).toBe(false);
    expect(puedeTenerSeguimiento({ modalidad_entrega_tipo: 'domicilio', estado: 'cancelado' })).toBe(false);
  });
});

function datos(over: Partial<DatosEmailSeguimiento> = {}): DatosEmailSeguimiento {
  return {
    empresaNombre: 'Mermelada',
    empresaLogoUrl: '',
    primaryColor: '#7c3aed',
    primaryForeground: '#ffffff',
    baseUrl: 'https://tienda.es',
    lang: 'es',
    numeroPedido: 42,
    fechaPedido: '2026-09-20T10:00:00Z',
    numeroSeguimiento: 'ES123456789',
    clienteNombre: 'Ana',
    direccionEntrega: 'Calle Mayor 1, Madrid',
    modalidadNombre: 'Battery Express',
    items: [
      { nombre: 'Tarro fresa', cantidad: 2, precio: 5, complementos: [{ nombre: 'Envoltorio regalo', precio: 1 }] },
      { nombre: 'Tarro higo', cantidad: 1, precio: 6.5, complementos: [] },
    ],
    gastosEnvioCents: 450,
    total: 23.5,
    ...over,
  };
}

describe('construirEmailSeguimiento', () => {
  it('incluye todos los datos del pedido', () => {
    const { subject, html, text } = construirEmailSeguimiento(datos());
    expect(subject).toContain('#42');
    expect(html).toContain('ES123456789');
    expect(html).toContain('Tarro fresa');
    expect(html).toContain('Envoltorio regalo');
    expect(html).toContain('Tarro higo');
    expect(html).toContain('Calle Mayor 1, Madrid');
    expect(html).toContain('Ana');
    // Tipo de envío + nombre de la modalidad (transportista)
    expect(html).toContain('Envío a domicilio');
    expect(html).toContain('Battery Express');
    expect(text).toContain('Battery Express');
    // (5 + 1) × 2 = 12,00 — el complemento se multiplica por la cantidad
    expect(html).toMatch(/12[.,]00/);
    expect(html).toMatch(/4[.,]50/);
    expect(html).toMatch(/23[.,]50/);
    expect(text).toContain('ES123456789');
    expect(text).toContain('Tarro fresa');
  });

  it('escapa todo lo que viene del admin o del cliente', () => {
    const { html } = construirEmailSeguimiento(datos({
      modalidadNombre: '<s>transportista</s>',
      numeroSeguimiento: '<script>x</script>',
      clienteNombre: '<img src=x onerror=alert(1)>',
      direccionEntrega: '"><b>dir</b>',
      items: [{ nombre: '<i>tarro</i>', cantidad: 1, precio: 1, complementos: [{ nombre: '<u>c</u>', precio: 0 }] }],
    }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>dir</b>');
    expect(html).not.toContain('<i>tarro</i>');
    expect(html).not.toContain('<u>c</u>');
    expect(html).not.toContain('<s>transportista</s>');
  });

  it('sin nombre de modalidad muestra solo el tipo de envío', () => {
    const { html } = construirEmailSeguimiento(datos({ modalidadNombre: null }));
    expect(html).toContain('Envío a domicilio');
    expect(html).not.toContain('Battery Express');
  });

  it('no pinta la fila de gastos de envío si no hay', () => {
    const { html } = construirEmailSeguimiento(datos({ gastosEnvioCents: null }));
    expect(html).not.toContain('Gastos de envío');
  });

  it('traduce según el idioma del cliente y cae a español si no lo conoce', () => {
    expect(construirEmailSeguimiento(datos({ lang: 'en' })).subject).toMatch(/shipped/i);
    expect(construirEmailSeguimiento(datos({ lang: 'xx' })).subject).toMatch(/enviado/i);
  });
});
