/**
 * Integración del configurador de personas en el money-path del pedido:
 * `PedidoUseCase.create` es el único punto donde precio y personas se
 * deciden — el server clampa N a [personas_min, personas_max], calcula el
 * precio desde la DB (precio + paso × (N − min)) y descarta la personas del
 * cliente cuando el producto no tiene configurador.
 *
 * Harness con todos los repos mockeados, igual que
 * `pedido-modalidad-revalidacion.test.ts` (no hay otro test de
 * `PedidoUseCase.create` en el repo).
 */
import { describe, it, expect, vi } from 'vitest';
import { PedidoUseCase, type CreatePedidoDTO } from '@/core/application/use-cases/pedido.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import type { IPedidoRepository } from '@/core/domain/repositories/IPedidoRepository';
import type { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import type { IProductRepository } from '@/core/domain/repositories/IProductRepository';
import type { ICodigoDescuentoRepository } from '@/core/domain/repositories/ICodigoDescuentoRepository';
import type { IMesaSesionRepository } from '@/core/domain/repositories/IMesaSesionRepository';
import type { PedidoRepoItem } from '@/core/domain/repositories/IPedidoRepository';
import type { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { Product } from '@/core/domain/entities/types';

const telegramSpy = vi.hoisted(() => vi.fn(async () => ({ success: true as const, data: { messageId: 1 } })));
vi.mock('@/core/infrastructure/services/telegram.service', () => ({
  sendTelegramWithQuickReplies: telegramSpy,
  sendTelegramWithInlineButtons: telegramSpy,
}));

// Kit Estándar 72H de KEC: 199 € base, paso 100 € por persona extra (DB).
const KIT_CONFIG = { personas_min: 1, personas_max: 10, personas_paso_cents: 10000 };

function buildPedidoRepoMock(): { repo: IPedidoRepository; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({ success: true, data: { id: 'pedido-1', numero_pedido: 1, total: 0 } });
  const repo: IPedidoRepository = {
    findAllByTenant: vi.fn(),
    findAllByTenantAndMonth: vi.fn(),
    updateStatus: vi.fn(),
    findById: vi.fn(),
    updateNumeroSeguimiento: vi.fn(),
    markSeguimientoEmailEnviado: vi.fn(),
    reclamarEmailConfirmacion: vi.fn(),
    liberarEmailConfirmacion: vi.fn(),
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

function buildProductRepoMock(productos: Partial<Product>[]): { repo: IProductRepository; findByIds: ReturnType<typeof vi.fn> } {
  const findByIds = vi.fn().mockResolvedValue({ success: true, data: productos as Product[] });
  const repo: IProductRepository = {
    create: vi.fn(),
    findAllByTenant: vi.fn(),
    findByIds,
    update: vi.fn(),
    delete: vi.fn(),
    findSlugsByPrefix: vi.fn(),
    findSlugsHistoricosByPrefix: vi.fn(),
  };
  return { repo, findByIds };
}

function buildUseCase(productos: Partial<Product>[]) {
  const { repo: pedidoRepo, create: pedidoRepoCreate } = buildPedidoRepoMock();
  const useCase = new PedidoUseCase(
    pedidoRepo,
    {
      findAllByTenant: vi.fn(),
      findByEmail: vi.fn(),
      findByTelefono: vi.fn().mockResolvedValue({ success: true, data: null }),
      create: vi.fn().mockResolvedValue({ success: true, data: { id: 'cliente-1' } }),
      update: vi.fn(),
      delete: vi.fn(),
      anonimizarCliente: vi.fn(),
      purgeExpiredClientes: vi.fn(),
      exportarCliente: vi.fn(),
    } as IClienteRepository,
    buildProductRepoMock(productos).repo,
    { create: vi.fn(), findByCodigo: vi.fn(), findByEmail: vi.fn(), markAsUsed: vi.fn() } as ICodigoDescuentoRepository,
    {
      openSesion: vi.fn(), closeSesion: vi.fn(), findActiveSesionByMesa: vi.fn(),
      findSesionWithOrders: vi.fn(), appendItems: vi.fn(), getDeferredItems: vi.fn(), setDeferredItems: vi.fn(),
    } as IMesaSesionRepository,
    // La modalidad no participa en estos tests: recogida implícita a 0.
    { validarPrecioVigente: vi.fn() } as unknown as ModalidadEntregaUseCase
  );
  return { useCase, pedidoRepoCreate };
}

// El precio que mandaría el cliente (manipulado a propósito): 1 €.
function dtoKit(overrides: Partial<CreatePedidoDTO['items'][number]> = {}): CreatePedidoDTO {
  return {
    items: [{
      item: { id: 'kit-1', name: 'Kit Estándar 72H', price: 1 },
      quantity: 1,
      ...overrides,
    }],
    nombre: 'Juan Pérez',
    telefono: '600111222',
  };
}

describe('PedidoUseCase.create — precio y personas del configurador, siempre del servidor', () => {
  it('clampa personas=99 a max=10 y cobra 199 € + 9 pasos desde la DB (no los 1 € del cliente)', async () => {
    const { useCase, pedidoRepoCreate } = buildUseCase([
      { id: 'kit-1', precio: 199, tipoProducto: 'comida', ...KIT_CONFIG },
    ]);

    const result = await useCase.create('empresa-1', dtoKit({ personas: 99 }), 'tienda', null, false, false);

    expect(result.success).toBe(true);
    const [, , repoItems, finalTotal] = pedidoRepoCreate.mock.calls[0] as [string, string, PedidoRepoItem[], number];
    expect(repoItems).toHaveLength(1);
    expect(repoItems[0].personas).toBe(10); // clamp, NO el 99 del cliente
    expect(repoItems[0].precio).toBe(1099); // 199 + 9 × 100, de la DB
    expect(finalTotal).toBeCloseTo(1099);
  });

  it('sin personas en el body, arranca en personas_min y cobra el precio base', async () => {
    const { useCase, pedidoRepoCreate } = buildUseCase([
      { id: 'kit-1', precio: 199, tipoProducto: 'comida', ...KIT_CONFIG },
    ]);

    await useCase.create('empresa-1', dtoKit(), 'tienda', null, false, false);

    const [, , repoItems] = pedidoRepoCreate.mock.calls[0] as [string, string, PedidoRepoItem[]];
    expect(repoItems[0].personas).toBe(1);
    expect(repoItems[0].precio).toBe(199);
  });

  it('producto SIN configurador: la personas del cliente se descarta y el precio es el de la DB', async () => {
    const { useCase, pedidoRepoCreate } = buildUseCase([
      { id: 'prod-1', precio: 10, tipoProducto: 'comida' },
    ]);

    const dto: CreatePedidoDTO = {
      items: [{ item: { id: 'prod-1', name: 'Pan', price: 999 }, quantity: 2, personas: 5 }],
      nombre: 'Juan Pérez',
      telefono: '600111222',
    };
    await useCase.create('empresa-1', dto, 'tienda', null, false, false);

    const [, , repoItems, finalTotal] = pedidoRepoCreate.mock.calls[0] as [string, string, PedidoRepoItem[], number];
    expect(repoItems[0].personas).toBeUndefined();
    expect(repoItems[0].precio).toBe(10); // DB, no los 999 € del cliente
    expect(finalTotal).toBeCloseTo(20);
  });

  it('restaurante: el ítem persistido queda byte-igual al de siempre (sin personas, precio de DB)', async () => {
    const { useCase, pedidoRepoCreate } = buildUseCase([
      { id: 'prod-1', precio: 10, tipoProducto: 'comida' },
    ]);

    const dto: CreatePedidoDTO = {
      items: [{ item: { id: 'prod-1', name: 'Pan', price: 10 }, quantity: 1, personas: 5 }],
      nombre: 'Mesa 3',
      telefono: '600111222',
    };
    await useCase.create('empresa-restaurante', dto, 'restaurante', null, false, false);

    const [, , repoItems] = pedidoRepoCreate.mock.calls[0] as [string, string, PedidoRepoItem[]];
    expect(repoItems[0]).toEqual({
      producto_id: 'prod-1',
      nombre: 'Pan',
      precio: 10,
      cantidad: 1,
      tipo_producto: 'comida',
      translations: undefined,
      complementos: [],
      nota: undefined,
    });
  });

  it('el eco de Telegram lleva el precio del SERVER (el aviso no puede contar otra cosa)', async () => {
    telegramSpy.mockClear();
    const { useCase } = buildUseCase([
      { id: 'kit-1', precio: 199, tipoProducto: 'comida', ...KIT_CONFIG },
    ]);

    await useCase.create('empresa-1', dtoKit({ personas: 3 }), 'tienda', 'chat-1', false, false);

    expect(telegramSpy).toHaveBeenCalledTimes(1);
    const aviso = (telegramSpy.mock.calls[0] as unknown[])[0] as { detalle_pedido: { precio: number }[] };
    expect(aviso.detalle_pedido[0].precio).toBe(399); // 199 + 2 × 100
  });
});
