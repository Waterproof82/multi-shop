import { NextResponse } from 'next/server';
import { z } from 'zod';
import { empresaRepository, pedidoUseCase } from '@/core/infrastructure/database';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const createPedidoSchema = z.object({
  items: z.array(z.object({
    item: z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
    }),
    quantity: z.number().min(1),
    selectedComplements: z.array(z.object({
      name: z.string(),
      price: z.number(),
    })).optional(),
  })),
  total: z.number().min(0).optional(),
  nombre: z.string().min(2).max(100),
  telefono: z.string().min(10).max(18).regex(/^[0-9]+$/, 'Formato de teléfono no válido'),
  email: z.string().email().optional().or(z.literal('')),
});

type OrderItem = z.infer<typeof createPedidoSchema>['items'][number];

function generateWhatsAppMessage(items: OrderItem[], total: number, nombre: string, numeroPedido: number): string {
  let mensaje = `*Pedido #${numeroPedido}*\n`;
  mensaje += `*Cliente:* ${nombre}\n\n`;
  mensaje += `*PEDIDO:*\n`;

  items.forEach((cartItem, index) => {
    const itemName = cartItem.item.name;
    const quantity = cartItem.quantity;

    mensaje += `${index + 1}. ${itemName}`;
    if (cartItem.selectedComplements && cartItem.selectedComplements.length > 0) {
      mensaje += ` (+${cartItem.selectedComplements.map(c => c.name).join(', ')})`;
    }
    mensaje += ` x${quantity}\n`;
  });

  mensaje += `\n*TOTAL: ${total.toFixed(2)}€*\n`;
  mensaje += `¿Cuándo puedo pasar a recoger el pedido?`;

  return mensaje;
}

export async function POST(request: Request) {
  try {
    const rateLimited = await rateLimitPublic(request);
    if (rateLimited) return rateLimited;

    const domain = await getDomainFromHeaders();
    const mainDomain = parseMainDomain(domain);

    const empresaResult = await empresaRepository.findByDomain(mainDomain);
    if (!empresaResult.success) {
      return NextResponse.json({ error: 'Error al buscar empresa' }, { status: 500 });
    }
    const empresa = empresaResult.data;

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createPedidoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { items, nombre, telefono, email } = parsed.data;

    const pedidoResult = await pedidoUseCase.create(empresa.id, {
      items,
      nombre,
      telefono,
      email: email || undefined,
    });

    if (!pedidoResult.success) {
      return NextResponse.json({ error: pedidoResult.error.message }, { status: 500 });
    }

    const { id: pedidoId, numero_pedido: numeroPedido, total: serverTotal } = pedidoResult.data;

    let whatsappLink: string | undefined;
    if (empresa.telefono_whatsapp) {
      const telefonoLimpio = empresa.telefono_whatsapp.replaceAll(/\D/g, '');
      const mensaje = generateWhatsAppMessage(items, serverTotal, nombre, numeroPedido);
      whatsappLink = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
    }

    return NextResponse.json({ success: true, numeroPedido, pedidoId, whatsappLink, companyPhone: empresa.telefono_whatsapp });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
