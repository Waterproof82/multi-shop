// tests/core/pedido-modalidad-revalidacion.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PedidoUseCase, type CreatePedidoDTO } from '@/core/application/use-cases/pedido.use-case';
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import type { IPedidoRepository } from '@/core/domain/repositories/IPedidoRepository';
import type { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import type { IProductRepository } from '@/core/domain/repositories/IProductRepository';
import type { ICodigoDescuentoRepository } from '@/core/domain/repositories/ICodigoDescuentoRepository';
import type { IMesaSesionRepository } from '@/core/domain/repositories/IMesaSesionRepository';
import type { Product } from '@/core/domain/entities/types';

// ─── Parte 1: contrato de ModalidadEntregaUseCase.validarPrecioVigente ───────
// Ya existe desde la Task 5 — este bloque documenta el contrato que
// PedidoUseCase.create consume en la Parte 2, no ejercita código nuevo.
describe('Revalidación de precio de modalidad al crear un pedido', () => {
  it('usa el precio de la DB, no el que manda el cliente', async () => {
    const modalidadRepo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'm1', empresaId: 'e1', tipo: 'domicilio', icono: 'bike', nombre: 'Envío', precioCents: 350, tiempoMinMinutos: 120, tiempoMaxMinutos: 180, activo: true, orden: 0 },
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const modalidadUseCase = new ModalidadEntregaUseCase(modalidadRepo);

    // Precio "manipulado" que un cliente malicioso intentaría colar: 1 céntimo.
    const result = await modalidadUseCase.validarPrecioVigente('m1', 'e1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.precioCents).toBe(350); // NO el que mandaría el cliente
    }
  });

  it('falla si la modalidad no pertenece a la empresa del pedido', async () => {
    const modalidadRepo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn(),
      findById: vi.fn().mockResolvedValue({ success: true, data: null }), // findById ya filtra por empresa_id
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const modalidadUseCase = new ModalidadEntregaUseCase(modalidadRepo);
    const result = await modalidadUseCase.validarPrecioVigente('m1', 'empresa-ajena');
    expect(result.success).toBe(false);
  });
});

// ─── Parte 2: PedidoUseCase.create con modalidad de entrega (tienda) ─────────
// No existe en el repo un test previo de integración de `PedidoUseCase.create`
// (se buscó con `rg -ln "new PedidoUseCase(" tests/` y no apareció ninguno) —
// se construye aquí el harness completo con todos los repos mockeados.
function buildPedidoRepoMock(): { repo: IPedidoRepository; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({ success: true, data: { id: 'pedido-1', numero_pedido: 1, total: 0 } });
  const repo: IPedidoRepository = {
    findAllByTenant: vi.fn(),
    findAllByTenantAndMonth: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    findByTrackingToken: vi.fn(),
    createMesaOrder: vi.fn(),
    updateItemPase: vi.fn(),
    findEstimatedReadyAtById: vi.fn(),
    findStatusById: vi.fn(),
    updateEstimatedTime: vi.fn(),
    updateStatusById: vi.fn(),
    saveTelegramMessageId: vi.fn(),
    deleteAllByTenant: vi.fn(),
    findBySesionId: vi.fn(),
    updateOrderItems: vi.fn(),
    consolidateSesionOrders: vi.fn(),
    create,
    findByIdempotencyKey: vi.fn(),
    getWaiterBadgeCounts: vi.fn(),
    findKitchenOrders: vi.fn(),
    findAllRetenidos: vi.fn(),
    findBarOrders: vi.fn(),
    findWaiterKitchenItems: vi.fn(),
    upsertItemEstado: vi.fn(),
    findPendientesValidacion: vi.fn(),
    validatePedido: vi.fn(),
    getStats: vi.fn(),
  };
  return { repo, create };
}

function buildClienteRepoMock(): IClienteRepository {
  return {
    findAllByTenant: vi.fn(),
    findByEmail: vi.fn(),
    findByTelefono: vi.fn().mockResolvedValue({ success: true, data: null }),
    create: vi.fn().mockResolvedValue({ success: true, data: { id: 'cliente-1' } }),
    update: vi.fn(),
    delete: vi.fn(),
    anonimizarCliente: vi.fn(),
    purgeExpiredClientes: vi.fn(),
    exportarCliente: vi.fn(),
  };
}

function buildProductRepoMock(): IProductRepository {
  return {
    create: vi.fn(),
    findAllByTenant: vi.fn(),
    findByIds: vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'prod-1', precio: 10, tipoProducto: 'comida' } as Product],
    }),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function buildDescuentoRepoMock(): ICodigoDescuentoRepository {
  return {
    create: vi.fn(),
    findByCodigo: vi.fn(),
    findByEmail: vi.fn(),
    markAsUsed: vi.fn(),
  };
}

function buildMesaSesionRepoMock(): IMesaSesionRepository {
  return {
    openSesion: vi.fn(),
    closeSesion: vi.fn(),
    findActiveSesionByMesa: vi.fn(),
    findSesionWithOrders: vi.fn(),
    appendItems: vi.fn(),
    getDeferredItems: vi.fn(),
    setDeferredItems: vi.fn(),
  };
}

function buildUseCase(modalidadEntregaUseCase: ModalidadEntregaUseCase) {
  const { repo: pedidoRepo, create: pedidoRepoCreate } = buildPedidoRepoMock();
  const useCase = new PedidoUseCase(
    pedidoRepo,
    buildClienteRepoMock(),
    buildProductRepoMock(),
    buildDescuentoRepoMock(),
    buildMesaSesionRepoMock(),
    modalidadEntregaUseCase
  );
  return { useCase, pedidoRepoCreate };
}

function baseDto(overrides: Partial<CreatePedidoDTO> = {}): CreatePedidoDTO {
  return {
    items: [{ item: { id: 'prod-1', name: 'Pan', price: 10 }, quantity: 1 }],
    nombre: 'Juan Pérez',
    telefono: '600111222',
    ...overrides,
  };
}

describe('PedidoUseCase.create — revalidación server-side de la modalidad de entrega', () => {
  it('persiste el tipo y el precio VALIDADOS por el servidor, nunca los que manda el cliente', async () => {
    // La DB dice que m1 es 'domicilio' a 550 céntimos.
    const modalidadEntregaUseCase = {
      validarPrecioVigente: vi.fn().mockResolvedValue({
        success: true,
        data: { precioCents: 550, tipo: 'domicilio' },
      }),
    } as unknown as ModalidadEntregaUseCase;
    const { useCase, pedidoRepoCreate } = buildUseCase(modalidadEntregaUseCase);

    // El cliente manda 'recogida' — intenta hacerse pasar por una modalidad sin
    // dirección para saltarse la recogida de domicilio, o simplemente su UI
    // quedó desincronizada. El servidor NUNCA debe confiar en este campo.
    const dto = baseDto({
      modalidad_entrega_id: 'm1',
      modalidad_entrega_tipo: 'recogida',
    });

    const result = await useCase.create('empresa-1', dto, 'tienda', null, false, false);

    expect(result.success).toBe(true);
    expect(modalidadEntregaUseCase.validarPrecioVigente).toHaveBeenCalledWith('m1', 'empresa-1');
    expect(pedidoRepoCreate).toHaveBeenCalledTimes(1);

    const [, , , finalTotal, , , payload] = pedidoRepoCreate.mock.calls[0] as [
      string, string, unknown, number, unknown, unknown, Record<string, unknown>
    ];

    // 10€ de producto + 550 céntimos de modalidad = 15.50€
    expect(finalTotal).toBeCloseTo(15.5);
    // El tipo persistido es el VALIDADO ('domicilio'), no el del cliente ('recogida').
    expect(payload.modalidad_entrega_tipo).toBe('domicilio');
    expect(payload.modalidad_entrega_precio_cents).toBe(550);
    expect(payload.modalidad_entrega_id).toBe('m1');
  });

  it('no persiste campos de modalidad si el pedido no incluye modalidad_entrega_id', async () => {
    const modalidadEntregaUseCase = {
      validarPrecioVigente: vi.fn(),
    } as unknown as ModalidadEntregaUseCase;
    const { useCase, pedidoRepoCreate } = buildUseCase(modalidadEntregaUseCase);

    const result = await useCase.create('empresa-1', baseDto(), 'tienda', null, false, false);

    expect(result.success).toBe(true);
    expect(modalidadEntregaUseCase.validarPrecioVigente).not.toHaveBeenCalled();
    const [, , , finalTotal, , , payload] = pedidoRepoCreate.mock.calls[0] as [
      string, string, unknown, number, unknown, unknown, Record<string, unknown> | undefined
    ];
    expect(finalTotal).toBeCloseTo(10);
    expect(payload?.modalidad_entrega_id).toBeUndefined();
  });

  it('falla sin crear el pedido si la modalidad ya no está disponible (inactiva o de otra empresa)', async () => {
    const modalidadEntregaUseCase = {
      validarPrecioVigente: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'MODALIDAD_ENTREGA_INVALIDA', message: 'no disponible', module: 'use-case', method: 'validarPrecioVigente' },
      }),
    } as unknown as ModalidadEntregaUseCase;
    const { useCase, pedidoRepoCreate } = buildUseCase(modalidadEntregaUseCase);

    const dto = baseDto({ modalidad_entrega_id: 'm1', modalidad_entrega_tipo: 'recogida' });
    const result = await useCase.create('empresa-1', dto, 'tienda', null, false, false);

    expect(result.success).toBe(false);
    expect(pedidoRepoCreate).not.toHaveBeenCalled();
  });

  it('incluye los campos de dirección solo cuando el tipo VALIDADO es domicilio', async () => {
    const modalidadEntregaUseCase = {
      validarPrecioVigente: vi.fn().mockResolvedValue({
        success: true,
        data: { precioCents: 0, tipo: 'recogida' },
      }),
    } as unknown as ModalidadEntregaUseCase;
    const { useCase, pedidoRepoCreate } = buildUseCase(modalidadEntregaUseCase);

    // El cliente manda dirección igual (por ejemplo, un residuo de un cambio de
    // pestaña en el wizard) pero la modalidad validada es 'recogida'.
    const dto = baseDto({
      modalidad_entrega_id: 'm2',
      modalidad_entrega_tipo: 'domicilio',
      direccion_entrega: 'Calle Falsa 123',
      codigo_postal: '28001',
    });

    await useCase.create('empresa-1', dto, 'tienda', null, false, false);

    const [, , , , , , payload] = pedidoRepoCreate.mock.calls[0] as [
      string, string, unknown, number, unknown, unknown, Record<string, unknown>
    ];
    expect(payload.modalidad_entrega_tipo).toBe('recogida');
    expect(payload.direccion_entrega).toBeUndefined();
    expect(payload.codigo_postal).toBeUndefined();
  });
});
