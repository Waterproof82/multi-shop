// tests/core/pedido-seguimiento.test.ts
//
// Contrato de PedidoUseCase para el número de seguimiento de envíos a
// domicilio. La elegibilidad (domicilio + no cancelado) la filtra el
// repositorio en el UPDATE; aquí se comprueba que el caso de uso normaliza la
// entrada y traduce "no había pedido elegible" a NOT_FOUND, y que no deja
// preparar un email sin número o sin destinatario.
import { describe, it, expect, vi } from 'vitest';
import { PedidoUseCase } from '@/core/application/use-cases/pedido.use-case';
import type { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IPedidoRepository } from '@/core/domain/repositories/IPedidoRepository';
import type { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import type { IProductRepository } from '@/core/domain/repositories/IProductRepository';
import type { ICodigoDescuentoRepository } from '@/core/domain/repositories/ICodigoDescuentoRepository';
import type { IMesaSesionRepository } from '@/core/domain/repositories/IMesaSesionRepository';
import type { Pedido } from '@/core/domain/entities/types';

function build(repo: Partial<IPedidoRepository>) {
  return new PedidoUseCase(
    repo as IPedidoRepository,
    {} as IClienteRepository,
    {} as IProductRepository,
    {} as ICodigoDescuentoRepository,
    {} as IMesaSesionRepository,
    {} as ModalidadEntregaUseCase,
  );
}

function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1',
    empresa_id: 'e1',
    cliente_id: 'c1',
    numero_pedido: 7,
    detalle_pedido: [],
    total: 10,
    moneda: 'EUR',
    estado: 'pendiente',
    created_at: '2026-09-20T10:00:00Z',
    tracking_token: 't',
    estimated_minutes: null,
    estimated_ready_at: null,
    clientes: { nombre: 'Ana', email: 'ana@ejemplo.com', telefono: '600', idioma: 'es' },
    numero_seguimiento: 'ES1',
    modalidad_entrega_tipo: 'domicilio',
    ...over,
  };
}

describe('PedidoUseCase.guardarNumeroSeguimiento', () => {
  it('recorta espacios y guarda', async () => {
    const updateNumeroSeguimiento = vi.fn().mockResolvedValue({ success: true, data: true });
    const r = await build({ updateNumeroSeguimiento }).guardarNumeroSeguimiento('p1', 'e1', '  ES123  ');
    expect(r.success).toBe(true);
    expect(updateNumeroSeguimiento).toHaveBeenCalledWith('p1', 'e1', 'ES123');
  });

  it('una cadena vacía borra el número (null)', async () => {
    const updateNumeroSeguimiento = vi.fn().mockResolvedValue({ success: true, data: true });
    await build({ updateNumeroSeguimiento }).guardarNumeroSeguimiento('p1', 'e1', '   ');
    expect(updateNumeroSeguimiento).toHaveBeenCalledWith('p1', 'e1', null);
  });

  it('NOT_FOUND si el pedido no es un envío a domicilio activo de la empresa', async () => {
    const updateNumeroSeguimiento = vi.fn().mockResolvedValue({ success: true, data: false });
    const r = await build({ updateNumeroSeguimiento }).guardarNumeroSeguimiento('p1', 'e1', 'ES1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('NOT_FOUND');
  });
});

describe('PedidoUseCase.prepararEmailSeguimiento', () => {
  it('devuelve el pedido cuando tiene número y email', async () => {
    const findById = vi.fn().mockResolvedValue({ success: true, data: pedido() });
    const r = await build({ findById }).prepararEmailSeguimiento('p1', 'e1');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.destinatario).toBe('ana@ejemplo.com');
  });

  it('NOT_FOUND si el pedido no existe', async () => {
    const findById = vi.fn().mockResolvedValue({ success: true, data: null });
    const r = await build({ findById }).prepararEmailSeguimiento('p1', 'e1');
    expect(!r.success && r.error.code).toBe('NOT_FOUND');
  });

  it('VALIDATION_ERROR si no es un envío a domicilio activo', async () => {
    const findById = vi.fn().mockResolvedValue({ success: true, data: pedido({ estado: 'cancelado' }) });
    const r = await build({ findById }).prepararEmailSeguimiento('p1', 'e1');
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
  });

  it('VALIDATION_ERROR sin número de seguimiento', async () => {
    const findById = vi.fn().mockResolvedValue({ success: true, data: pedido({ numero_seguimiento: null }) });
    const r = await build({ findById }).prepararEmailSeguimiento('p1', 'e1');
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
  });

  it('VALIDATION_ERROR si el cliente no tiene email', async () => {
    const findById = vi.fn().mockResolvedValue({
      success: true,
      data: pedido({ clientes: { nombre: 'Ana', email: '', telefono: '600' } }),
    });
    const r = await build({ findById }).prepararEmailSeguimiento('p1', 'e1');
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
  });
});
