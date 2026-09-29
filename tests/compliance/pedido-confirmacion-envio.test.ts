/**
 * Envío del email de confirmación de pedido.
 *
 * Lo pueden disparar DOS caminos para el mismo pedido pagado: el aviso de
 * Redsys (webhook) y la vuelta del navegador (`confirm-pedido`), además de los
 * reintentos idempotentes de `POST /api/pedidos`. El candado es la columna
 * `confirmacion_email_enviado_at`, reclamada con un UPDATE condicionado: solo
 * quien la reclama envía. Si el envío falla, se suelta para que otro camino
 * pueda reintentarlo.
 *
 * Y nunca lanza: el pedido ya está creado o cobrado, un fallo de Brevo no puede
 * convertir eso en un error para el cliente ni para Redsys.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pedido } from '@/core/domain/entities/types';
import {
  crearEnviarConfirmacionPedido,
  type DepsConfirmacion,
} from '@/core/application/use-cases/pedido/enviar-confirmacion-pedido.use-case';

function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1',
    empresa_id: 'e1',
    cliente_id: 'c1',
    numero_pedido: 42,
    detalle_pedido: [{ nombre: 'Tarta', precio: 10, cantidad: 2 }],
    total: 20,
    moneda: 'EUR',
    estado: 'pendiente',
    created_at: '2026-09-29T10:00:00.000Z',
    tracking_token: 'tok-1',
    estimated_minutes: null,
    estimated_ready_at: null,
    clientes: { nombre: 'Ana', email: 'ana@example.com', telefono: '34600000000', idioma: 'es' },
    mesa_id: null,
    ...over,
  };
}

function deps(over: Partial<DepsConfirmacion> = {}) {
  const base: DepsConfirmacion = {
    buscarPedido: vi.fn(async () => ({ success: true as const, data: pedido() })),
    reclamarEnvio: vi.fn(async () => ({ success: true as const, data: true })),
    liberarEnvio: vi.fn(async () => ({ success: true as const, data: undefined })),
    buscarEmpresa: vi.fn(async () => ({
      nombre: 'Mermelada', logoUrl: '', primaryColor: '#000', primaryForeground: '#fff', dominio: 'tienda.es', emailNotification: null,
    })),
    enviar: vi.fn(async () => ({})),
  };
  return { ...base, ...over };
}

const ENTRADA = { pedidoId: 'p1', empresaId: 'e1', pagado: false, origen: 'https://app.test' };

describe('enviarConfirmacionPedido', () => {
  it('envía al email del cliente con el número de pedido y enlace de seguimiento', async () => {
    const d = deps();
    const resultado = await crearEnviarConfirmacionPedido(d)(ENTRADA);

    expect(resultado).toBe('enviado');
    expect(d.enviar).toHaveBeenCalledTimes(1);
    const enviado = vi.mocked(d.enviar).mock.calls[0][0];
    expect(enviado.to).toBe('ana@example.com');
    expect(enviado.subject).toContain('42');
    expect(enviado.htmlContent).toContain('https://tienda.es/tracking/tok-1');
    expect(enviado.senderName).toBe('Mermelada');
  });

  it('sin email no reclama ni envía', async () => {
    const d = deps({ buscarPedido: vi.fn(async () => ({ success: true as const, data: pedido({ clientes: { nombre: 'Ana', email: '  ', telefono: '1' } }) })) });
    expect(await crearEnviarConfirmacionPedido(d)(ENTRADA)).toBe('sin_email');
    expect(d.reclamarEnvio).not.toHaveBeenCalled();
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('pedidos de mesa no reciben email', async () => {
    const d = deps({ buscarPedido: vi.fn(async () => ({ success: true as const, data: pedido({ mesa_id: 'm1' }) })) });
    expect(await crearEnviarConfirmacionPedido(d)(ENTRADA)).toBe('no_aplica');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('si otro camino ya lo reclamó, no envía otra vez', async () => {
    const d = deps({ reclamarEnvio: vi.fn(async () => ({ success: true as const, data: false })) });
    expect(await crearEnviarConfirmacionPedido(d)(ENTRADA)).toBe('ya_enviado');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('si Brevo falla, suelta el candado y no lanza', async () => {
    const d = deps({ enviar: vi.fn(async () => { throw new Error('Brevo API error: 500'); }) });
    expect(await crearEnviarConfirmacionPedido(d)(ENTRADA)).toBe('error');
    expect(d.liberarEnvio).toHaveBeenCalledWith('p1', 'e1');
  });

  it('pedido inexistente o error de lectura: no lanza ni envía', async () => {
    const noExiste = deps({ buscarPedido: vi.fn(async () => ({ success: true as const, data: null })) });
    expect(await crearEnviarConfirmacionPedido(noExiste)(ENTRADA)).toBe('no_aplica');

    const lecturaRota = deps({ buscarPedido: vi.fn(async () => { throw new Error('boom'); }) });
    expect(await crearEnviarConfirmacionPedido(lecturaRota)(ENTRADA)).toBe('error');
    expect(lecturaRota.enviar).not.toHaveBeenCalled();
  });

  it('pagado: el email dice que el pago está confirmado', async () => {
    const d = deps();
    await crearEnviarConfirmacionPedido(d)({ ...ENTRADA, pagado: true });
    expect(vi.mocked(d.enviar).mock.calls[0][0].htmlContent).toContain('Pago confirmado');
  });

  it('sin token de seguimiento enlaza a la web', async () => {
    const d = deps({ buscarPedido: vi.fn(async () => ({ success: true as const, data: pedido({ tracking_token: null }) })) });
    await crearEnviarConfirmacionPedido(d)(ENTRADA);
    expect(vi.mocked(d.enviar).mock.calls[0][0].htmlContent).not.toContain('/tracking/');
  });
});
