/**
 * E2E — pedidos: excepción de borrado acotada a datos de prueba (Art. 66 LGT)
 *
 * `pedidos` tiene retención fiscal mínima de 5 años, y el trigger
 * `pedidos_block_delete` bloquea el DELETE. Ese bloqueo era incondicional, lo
 * que dejaba a los tests E2E sin forma de limpiar: su teardown solo podía mover
 * los pedidos sintéticos a 'cancelado', y las filas se acumulaban para siempre
 * en la tabla fiscal (200 pedidos `__test_*` acumulados a fecha de esta suite,
 * contaminando el "Top Platos del Año" del dashboard).
 *
 * La excepción introducida permite borrar SOLO pedidos marcados `es_prueba`.
 * Ese permiso es exactamente el tipo de agujero que, si alguien lo ensancha por
 * comodidad, convierte el borrado de registros fiscales en algo posible. Esta
 * suite existe para que ensancharlo rompa el CI.
 *
 * Verifica vía Supabase REST API con service_role:
 *   1. Un pedido REAL (es_prueba=false) NO se puede borrar.
 *   2. Un pedido real NO se puede reclasificar como prueba (flag inmutable),
 *      que es lo que impediría usar la excepción como puerta trasera.
 *   3. Un pedido de prueba SÍ se puede borrar.
 *   4. El borrado queda registrado en `pedidos_prueba_purga_log`.
 *
 * NOTA SOBRE EL DISEÑO DE ESTA SUITE
 * Para los casos 1 y 2 se apunta a un pedido real YA EXISTENTE en vez de crear
 * uno: como ambas operaciones deben fallar, no hay mutación y la suite no deja
 * residuo. Crear un pedido real de control sería reproducir el mismo problema
 * que esta suite protege — una fila imborrable más por cada ejecución de CI.
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.skip(
  !process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY,
  'Requiere PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY',
);

function supabaseUrl(): string { return process.env.NEXT_PUBLIC_SUPABASE_URL!; }
function serviceKey(): string  { return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY!; }

function serviceHeaders(prefer = 'return=representation') {
  return {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

test.describe('pedidos — borrado acotado a datos de prueba (Art. 66 LGT)', () => {
  /** Pedido real preexistente: objetivo de intentos que DEBEN fallar. */
  let pedidoRealId: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    try {
      const res = await ctx.get(
        `${supabaseUrl()}/rest/v1/pedidos?es_prueba=is.false&select=id&limit=1`,
        { headers: serviceHeaders() },
      );
      if (!res.ok()) return;
      const rows = await res.json() as Array<{ id: string }>;
      pedidoRealId = rows[0]?.id ?? null;
    } finally {
      await ctx.dispose();
    }
  });

  test('DELETE de pedido real → bloqueado por pedidos_block_delete', async ({ request }) => {
    test.skip(!pedidoRealId, 'No hay ningún pedido real contra el que verificar');
    const res = await request.delete(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pedidoRealId}`,
      { headers: serviceHeaders('return=minimal') },
    );
    expect([400, 409]).toContain(res.status());
    expect(await res.text()).toMatch(/DELETE no permitido|Art\.?\s*66|retenci/i);

    // Y sigue existiendo: el bloqueo no puede quedarse en un mensaje de error.
    const check = await request.get(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pedidoRealId}&select=id`,
      { headers: serviceHeaders() },
    );
    expect((await check.json() as unknown[]).length).toBe(1);
  });

  test('UPDATE es_prueba=true sobre pedido real → bloqueado (flag inmutable)', async ({ request }) => {
    test.skip(!pedidoRealId, 'No hay ningún pedido real contra el que verificar');
    // Sin esta barrera la excepción sería inútil como control: bastaría marcar
    // cualquier pedido facturado como prueba y borrarlo acto seguido.
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pedidoRealId}`,
      { headers: serviceHeaders('return=minimal'), data: { es_prueba: true } },
    );
    expect([400, 409]).toContain(res.status());
    expect(await res.text()).toMatch(/inmutable|es_prueba/i);

    const check = await request.get(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pedidoRealId}&select=es_prueba`,
      { headers: serviceHeaders() },
    );
    const rows = await check.json() as Array<{ es_prueba: boolean }>;
    expect(rows[0]?.es_prueba).toBe(false);
  });

  test('DELETE de pedido de prueba → permitido y registrado en el log', async ({ request }) => {
    test.skip(!pedidoRealId, 'Sin empresa de referencia para crear el pedido de prueba');

    // Reutiliza la empresa del pedido real para respetar la FK de empresa_id.
    const ref = await request.get(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pedidoRealId}&select=empresa_id`,
      { headers: serviceHeaders() },
    );
    const empresaId = (await ref.json() as Array<{ empresa_id: string }>)[0]?.empresa_id;
    test.skip(!empresaId, 'No se pudo resolver empresa_id');

    const pruebaId = randomUUID();
    const creado = await request.post(`${supabaseUrl()}/rest/v1/pedidos`, {
      headers: serviceHeaders(),
      data: {
        id: pruebaId, empresa_id: empresaId, total: 0, estado: 'pendiente',
        es_prueba: true,
        detalle_pedido: [{ nombre: '__test_barrera_prueba__', cantidad: 1, precio: 0 }],
      },
    });
    test.skip(!creado.ok(), 'No se pudo crear el pedido de prueba de control');

    const res = await request.delete(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pruebaId}`,
      { headers: serviceHeaders('return=minimal') },
    );
    expect(res.status()).toBe(204);

    const check = await request.get(
      `${supabaseUrl()}/rest/v1/pedidos?id=eq.${pruebaId}&select=id`,
      { headers: serviceHeaders() },
    );
    expect((await check.json() as unknown[]).length).toBe(0);

    // Traza obligatoria: sin rastro no hay forma de demostrar que la excepción
    // solo se aplicó a datos sintéticos.
    const log = await request.get(
      `${supabaseUrl()}/rest/v1/pedidos_prueba_purga_log?pedido_id=eq.${pruebaId}&select=pedido_id,purgado_at`,
      { headers: serviceHeaders() },
    );
    expect(log.status()).toBe(200);
    expect((await log.json() as unknown[]).length).toBe(1);
  });
});
