import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  getTiendaModalidadBadgeInfo,
  renderOrigenBadge,
} from '@/app/admin/(protected)/pedidos/page';

// Subconjunto mínimo de campos que consume la lógica bajo test — evita
// depender del tipo `Pedido` completo (que exige clientes/mesas/sesion/etc).
function buildPedido(overrides: Partial<{
  mesa_id: string | null;
  tracking_token: string | null;
  origen: string | null;
  modalidad_entrega_tipo: 'recogida' | 'domicilio' | null;
  direccion_entrega: string | null;
}>) {
  return {
    id: 'p1',
    numero_pedido: 1,
    cliente_id: null,
    clientes: null,
    total: 10,
    moneda: 'EUR',
    detalle_pedido: [],
    estado: 'pendiente',
    created_at: new Date().toISOString(),
    mesa_id: null,
    tracking_token: null,
    mesas: null,
    sesion: null,
    modalidad_entrega_tipo: null,
    direccion_entrega: null,
    ...overrides,
  };
}

describe('getTiendaModalidadBadgeInfo', () => {
  it('devuelve info de domicilio con la dirección cuando modalidad_entrega_tipo es domicilio', () => {
    const pedido = buildPedido({ modalidad_entrega_tipo: 'domicilio', direccion_entrega: 'Calle Falsa 123' });
    expect(getTiendaModalidadBadgeInfo(pedido)).toEqual({
      labelKey: 'tiendaEnvioLabel',
      direccion: 'Calle Falsa 123',
    });
  });

  it('devuelve info de recogida sin dirección cuando modalidad_entrega_tipo es recogida', () => {
    const pedido = buildPedido({ modalidad_entrega_tipo: 'recogida', direccion_entrega: null });
    expect(getTiendaModalidadBadgeInfo(pedido)).toEqual({
      labelKey: 'tiendaRecogidaLabel',
      direccion: null,
    });
  });

  it('devuelve null cuando el pedido no tiene modalidad_entrega_tipo (restaurante)', () => {
    const pedido = buildPedido({ modalidad_entrega_tipo: null });
    expect(getTiendaModalidadBadgeInfo(pedido)).toBeNull();
  });
});

describe('renderOrigenBadge — precedencia de modalidad de tienda', () => {
  it('muestra el badge de domicilio aunque el pedido tenga tracking_token seteado', () => {
    // Regresión: shouldGenerateTrackingToken() en pedido.use-case.ts setea
    // tracking_token en TODOS los pedidos de tienda, incluidos los de
    // domicilio. Sin chequear modalidad_entrega_tipo primero, el badge caía
    // en la rama `tracking_token` y mostraba "Recogida" para un envío real.
    const pedido = buildPedido({
      tracking_token: 'abc123',
      modalidad_entrega_tipo: 'domicilio',
      direccion_entrega: 'Av. Siempre Viva 742',
    });
    render(renderOrigenBadge(pedido, 'es'));
    expect(screen.getByText('Envío a domicilio')).toBeInTheDocument();
    expect(screen.getByText('Av. Siempre Viva 742')).toBeInTheDocument();
    expect(screen.queryByText('Recogida')).not.toBeInTheDocument();
  });

  it('muestra el badge de recogida en tienda sin dirección', () => {
    const pedido = buildPedido({ tracking_token: 'abc123', modalidad_entrega_tipo: 'recogida' });
    render(renderOrigenBadge(pedido, 'es'));
    expect(screen.getByText('Recogida en tienda')).toBeInTheDocument();
  });

  it('mantiene el comportamiento existente de restaurante cuando no hay modalidad', () => {
    const pedido = buildPedido({ tracking_token: 'abc123', modalidad_entrega_tipo: null });
    render(renderOrigenBadge(pedido, 'es'));
    expect(screen.getByText('Recogida')).toBeInTheDocument();
  });
});
