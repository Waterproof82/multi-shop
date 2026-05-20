import { NextResponse } from 'next/server';
import { z } from 'zod';
import { empresaPublicRepository, pedidoUseCase } from '@/core/infrastructure/database';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const createPedidoSchema = z.object({
  items: z.array(z.object({
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
  })).min(1).max(50),
  total: z.number().min(0).max(100_000).optional(), // This is ignored, server recalculates
  nombre: z.string().min(2).max(100),
  telefono: z.string().min(9).max(20).regex(/^\+?[0-9\s\-()+]+$/, 'Formato de teléfono no válido'),
  email: z.string().email().optional().or(z.literal('')),
  idioma: z.enum(['es', 'en', 'fr', 'it', 'de']).optional(),
  codigoDescuento: z.string().max(30).optional(),
}).refine(data => !data.codigoDescuento || (data.email && data.email.length > 0), {
  message: 'Email is required when using a discount code',
  path: ['email'],
});

export async function POST(request: Request) {
    const rateLimited = await rateLimitPublic(request);
    if (rateLimited) return rateLimited;

    const domain = await getDomainFromHeaders();
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

    const pedidoResult = await pedidoUseCase.create(
      empresa.id,
      parsed.data,
      empresa.tipo ?? 'tienda',
      empresa.telegram_chat_id ?? null
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
        ...(trackingToken && { trackingToken }),
    });
}
