import { NextResponse } from 'next/server';
import { z } from 'zod';
import { empresaPublicRepository, pedidoUseCase, mesaUseCase } from '@/core/infrastructure/database';
import { parseMainDomain, isPedidosDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { validateMesaClientToken } from '@/core/infrastructure/api/validate-mesa-client-token';
import { verifyWaiterToken } from '@/lib/waiter-auth';

const itemsSchema = z.array(z.object({
  item: z.object({
    id: z.string().uuid(),
    name: z.string().max(200),
    price: z.number().min(0).max(100_000),
    translations: z.object({
      en: z.object({ name: z.string().max(200) }).optional(),
      fr: z.object({ name: z.string().max(200) }).optional(),
      it: z.object({ name: z.string().max(200) }).optional(),
      de: z.object({ name: z.string().max(200) }).optional(),
    }).optional(),
  }),
  quantity: z.number().int().min(1).max(99),
  selectedComplements: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().max(200),
    price: z.number().min(0).max(100_000),
  })).max(20).optional(),
})).min(1).max(50);

const mesaPedidoSchema = z.object({
  tipo: z.literal('mesa'),
  mesa_id: z.string().uuid('El mesa_id debe ser un UUID válido'),
  items: itemsSchema,
  idioma: z.enum(['es', 'en', 'fr', 'it', 'de']).optional(),
});

const defaultPedidoSchema = z.object({
  tipo: z.enum(['restaurante', 'tienda']).optional(),
  items: itemsSchema,
  total: z.number().min(0).max(100_000).optional(), // ignored — server recalculates
  nombre: z.string().min(2).max(100),
  telefono: z.string().min(9).max(20).regex(/^\+?[0-9\s\-()+]+$/, 'Formato de teléfono no válido'),
  email: z.string().email().optional().or(z.literal('')),
  idioma: z.enum(['es', 'en', 'fr', 'it', 'de']).optional(),
  codigoDescuento: z.string().max(30).optional(),
  // Delivery fields (restaurant only)
  origen: z.enum(['recogida', 'delivery']).optional(),
  direccion_entrega: z.string().max(500).optional(),
  codigo_postal: z.string().max(10).optional(),
  latitude_entrega: z.number().min(-90).max(90).optional(),
  longitude_entrega: z.number().min(-180).max(180).optional(),
  estimated_delivery_fee_cents: z.number().int().min(0).max(100000).optional(),
}).refine(data => !data.codigoDescuento || (data.email && data.email.length > 0), {
  message: 'Email is required when using a discount code',
  path: ['email'],
});

// z.discriminatedUnion does not support .refine() in Zod v3 — use z.union instead
const createPedidoSchema = z.union([
  mesaPedidoSchema,
  defaultPedidoSchema,
]);

type MesaData = z.infer<typeof mesaPedidoSchema>;
type DefaultData = z.infer<typeof defaultPedidoSchema>;
type EmpresaOrderData = NonNullable<Extract<Awaited<ReturnType<typeof empresaPublicRepository.findByDomain>>, { success: true }>['data']>;

async function checkMesaPaymentLock(mesaId: string): Promise<NextResponse | null> {
  const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
  const supabase = getSupabaseClient();
  const { data: sesionLock, error: lockError } = await supabase
    .from('mesa_sesiones')
    .select('pago_en_curso, pago_iniciado_en')
    .eq('mesa_id', mesaId)
    .is('cerrada_at', null)
    .maybeSingle();
  if (lockError) {
    return NextResponse.json({ error: 'Error al verificar el estado de la mesa.' }, { status: 500 });
  }
  const lock = sesionLock as { pago_en_curso: boolean; pago_iniciado_en: string | null } | null;
  const LOCK_EXPIRY_MS = 15 * 60 * 1000;
  const lockFresh = lock?.pago_iniciado_en
    ? Date.now() - new Date(lock.pago_iniciado_en).getTime() < LOCK_EXPIRY_MS
    : false;
  if (lock?.pago_en_curso && lockFresh) {
    return NextResponse.json({ error: 'Hay un pago en curso en esta mesa. Espera a que finalice.' }, { status: 423 });
  }
  return null;
}

async function isWaiterRequest(request: Request): Promise<boolean> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)waiter_token=([^;]+)/.exec(cookie);
  if (!match) return false;
  const payload = await verifyWaiterToken(decodeURIComponent(match[1]));
  return payload !== null;
}

async function handleMesaOrder(empresa: EmpresaOrderData, data: MesaData, request: Request): Promise<NextResponse> {
  const isWaiter = await isWaiterRequest(request);

  // Guard: mesa ordering must be enabled for this empresa.
  // Waiter requests bypass this — staff can always place orders regardless of the toggle.
  if (!empresa.mesas_habilitadas && !isWaiter) {
    return NextResponse.json({ error: 'El servicio de mesas no está disponible.' }, { status: 403 });
  }

  // Validate client QR token for mesa orders (skipped for waiters — they use waiter_token)
  const tokenError = isWaiter ? null : await validateMesaClientToken(request);
  if (tokenError) return tokenError;

  const mesaResult = await mesaUseCase.getMesa(data.mesa_id);
  if (!mesaResult.success) {
    return NextResponse.json({ error: 'Error al verificar la mesa' }, { status: 500 });
  }
  if (!mesaResult.data) {
    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }

  const lockResponse = await checkMesaPaymentLock(data.mesa_id);
  if (lockResponse) return lockResponse;

  const pedidoResult = await pedidoUseCase.createMesaOrder(
    empresa.id,
    { items: data.items, mesa_id: data.mesa_id, idioma: data.idioma },
    mesaResult.data.numero,
    mesaResult.data.nombre,
    empresa.telegram_mesa_chat_id ?? null,
    empresa.telegram_chat_id ?? null,
    empresa.telegram_bebidas_chat_id ?? null
  );

  if (!pedidoResult.success) {
    const errorCode = pedidoResult.error.code;
    if (['PRODUCT_NOT_FOUND', 'INVALID_UUID'].includes(errorCode)) {
      return NextResponse.json({ error: pedidoResult.error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error al crear el pedido de mesa' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    numeroPedido: pedidoResult.data.numero_pedido,
    pedidoId: pedidoResult.data.id,
    tipo: 'mesa',
    trackingToken: pedidoResult.data.trackingToken,
  });
}

async function handleDefaultOrder(empresa: EmpresaOrderData, data: DefaultData, isPedidos: boolean): Promise<NextResponse> {
  const pedidoResult = await pedidoUseCase.create(
    empresa.id,
    data,
    empresa.tipo ?? 'tienda',
    empresa.telegram_chat_id ?? null,
    isPedidos,
    empresa.pagos_pickup_habilitados ?? false
  );

  if (!pedidoResult.success) {
    const errorCode = pedidoResult.error.code;
    if (['PRODUCT_NOT_FOUND', 'CODE_EXPIRED', 'CODE_ALREADY_USED', 'EMAIL_MISMATCH'].includes(errorCode)) {
      return NextResponse.json({ error: pedidoResult.error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error al crear el pedido' }, { status: 500 });
  }

  const { id: pedidoId, numero_pedido: numeroPedido, trackingToken } = pedidoResult.data;
  return NextResponse.json({
    success: true,
    numeroPedido,
    pedidoId,
    tipo: empresa.tipo ?? 'tienda',
    ...(trackingToken && { trackingToken }),
  });
}

export async function POST(request: Request) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const isPedidos = isPedidosDomain(domain);
  const mainDomain = parseMainDomain(domain);

  const empresaResult = await empresaPublicRepository.findByDomain(mainDomain);
  if (!empresaResult.success || !empresaResult.data) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }
  const empresa = empresaResult.data;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = createPedidoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const data = parsed.data;
  if (data.tipo === 'mesa') return handleMesaOrder(empresa, data, request);
  return handleDefaultOrder(empresa, data, isPedidos);
}
