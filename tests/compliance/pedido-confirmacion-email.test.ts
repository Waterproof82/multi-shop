/**
 * Email de confirmación de pedido al cliente.
 *
 * Sale firmado con el nombre del negocio y lleva datos escritos por el cliente
 * (nombre, dirección, complementos): cualquiera sin escapar es inyección de HTML
 * en un correo real. Y el texto tiene que decir la verdad sobre el pago: "pago
 * confirmado" solo cuando Redsys lo ha confirmado.
 */
import { describe, it, expect } from 'vitest';
import {
  construirEmailConfirmacion,
  tipoEntregaDelPedido,
  type DatosEmailConfirmacion,
} from '../../src/core/infrastructure/services/confirmacion-pedido-email.builder';

function datos(over: Partial<DatosEmailConfirmacion> = {}): DatosEmailConfirmacion {
  return {
    empresaNombre: 'Mermelada',
    empresaLogoUrl: '',
    primaryColor: '#7c3aed',
    primaryForeground: '#ffffff',
    baseUrl: 'https://tienda.es',
    lang: 'es',
    numeroPedido: 42,
    fechaPedido: '2026-09-29T10:00:00.000Z',
    pagado: false,
    clienteNombre: 'Ana',
    trackingUrl: 'https://tienda.es/tracking/abc',
    tipoEntrega: 'recogida',
    modalidadNombre: null,
    direccionEntrega: null,
    items: [{ nombre: 'Tarta', cantidad: 2, precio: 10, complementos: [] }],
    gastosEnvioCents: null,
    total: 20,
    ...over,
  };
}

describe('construirEmailConfirmacion — contenido', () => {
  it('el asunto lleva el número de pedido en cada idioma', () => {
    for (const lang of ['es', 'en', 'fr', 'it', 'de']) {
      expect(construirEmailConfirmacion(datos({ lang })).subject).toContain('42');
    }
  });

  it('idioma desconocido cae a castellano', () => {
    expect(construirEmailConfirmacion(datos({ lang: 'xx' })).subject).toContain('pedido');
  });

  it('sin pago no dice que esté pagado; con pago sí', () => {
    const sinPago = construirEmailConfirmacion(datos());
    const conPago = construirEmailConfirmacion(datos({ pagado: true }));
    expect(sinPago.html).not.toContain('Pago confirmado');
    expect(sinPago.text).not.toContain('Pago confirmado');
    expect(conPago.html).toContain('Pago confirmado');
    expect(conPago.text).toContain('Pago confirmado');
  });

  it('enlaza al seguimiento si hay token; si no, a la web', () => {
    expect(construirEmailConfirmacion(datos()).html).toContain('https://tienda.es/tracking/abc');
    const sinToken = construirEmailConfirmacion(datos({ trackingUrl: null }));
    expect(sinToken.html).not.toContain('/tracking/');
    expect(sinToken.html).toContain('href="https://tienda.es"');
  });

  it('muestra envío y dirección solo a domicilio', () => {
    const domicilio = construirEmailConfirmacion(datos({
      tipoEntrega: 'domicilio', modalidadNombre: 'SEUR 24h', direccionEntrega: 'Calle Mayor 1', gastosEnvioCents: 490, total: 24.9,
    }));
    expect(domicilio.html).toContain('SEUR 24h');
    expect(domicilio.html).toContain('Calle Mayor 1');
    expect(domicilio.html).toContain('Gastos de envío');
    expect(construirEmailConfirmacion(datos()).html).not.toContain('Gastos de envío');
  });
});

describe('construirEmailConfirmacion — escapado', () => {
  it('escapa nombre del cliente, dirección, productos, complementos y empresa', () => {
    const { html } = construirEmailConfirmacion(datos({
      empresaNombre: '<b>Shop</b>',
      clienteNombre: '<script>x</script>',
      tipoEntrega: 'domicilio',
      direccionEntrega: '<img src=x onerror=1>',
      items: [{ nombre: '<i>Tarta</i>', cantidad: 1, precio: 5, complementos: [{ nombre: '<u>Nata</u>', precio: 1 }] }],
    }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<i>Tarta');
    expect(html).not.toContain('<u>Nata');
    expect(html).not.toContain('<b>Shop');
  });
});

describe('tipoEntregaDelPedido', () => {
  it('tienda: la modalidad copiada en el pedido manda', () => {
    expect(tipoEntregaDelPedido({ modalidad_entrega_tipo: 'domicilio', origen: null })).toBe('domicilio');
    expect(tipoEntregaDelPedido({ modalidad_entrega_tipo: 'recogida', origen: null })).toBe('recogida');
  });

  it('restaurante: delivery es domicilio, recogida es recogida', () => {
    expect(tipoEntregaDelPedido({ modalidad_entrega_tipo: null, origen: 'delivery' })).toBe('domicilio');
    expect(tipoEntregaDelPedido({ modalidad_entrega_tipo: null, origen: 'recogida' })).toBe('recogida');
  });

  it('sin datos no inventa un método', () => {
    expect(tipoEntregaDelPedido({ modalidad_entrega_tipo: null, origen: null })).toBeNull();
  });
});
