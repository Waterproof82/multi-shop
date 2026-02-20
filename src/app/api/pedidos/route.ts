import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;

interface CartItem {
  item: {
    id: string;
    name: string;
    price: number;
    translations?: Record<string, { name: string }>;
  };
  quantity: number;
  selectedComplements?: { name: string; price: number }[];
}

async function getDomainFromHeaders(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host');
  if (!host) return '';
  return host.replace(/^www\./, '').toLowerCase().split(':')[0];
}

function generateOrderEmail(items: CartItem[], total: number, empresaNombre: string, numeroPedido: number, nombre: string, telefono: string): string {
  const itemsHtml = items.map(ci => {
    const complementPrice = ci.selectedComplements?.reduce((sum, c) => sum + c.price, 0) || 0;
    const itemTotal = (ci.item.price + complementPrice) * ci.quantity;
    
    const complementsHtml = ci.selectedComplements?.map(c => 
      `<li style="margin-left: 20px; color: #666;">+ ${c.name} (${c.price.toFixed(2)}€)</li>`
    ).join('') || '';

    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 8px;">
          <strong>${ci.item.name}</strong>
          ${complementsHtml ? `<ul style="margin: 4px 0 0 0; padding: 0;">${complementsHtml}</ul>` : ''}
        </td>
        <td style="padding: 12px 8px; text-align: center;">${ci.quantity}</td>
        <td style="padding: 12px 8px; text-align: right;">${itemTotal.toFixed(2)}€</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr style="background-color: #1a1a1a;">
            <td style="padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${empresaNombre}</h1>
              <p style="margin: 8px 0 0 0; color: #888; font-size: 14px;">Nuevo Pedido #${numeroPedido}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #333; font-size: 14px;"><strong>Cliente:</strong> ${nombre}</p>
                    <p style="margin: 8px 0 0 0; color: #333; font-size: 14px;"><strong>Teléfono:</strong> ${telefono}</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; color: #333; font-size: 16px;">
                Detalles del pedido:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #f9f9f9;">
                    <th style="padding: 12px 8px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a1a;">Producto</th>
                    <th style="padding: 12px 8px; text-align: center; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a1a;">Cant.</th>
                    <th style="padding: 12px 8px; text-align: right; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a1a;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 16px 0; border-top: 2px solid #1a1a1a;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 18px; font-weight: 600; color: #333;">TOTAL</td>
                        <td style="text-align: right; font-size: 24px; font-weight: 700; color: #1a1a1a;">${total.toFixed(2)}€</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr style="background-color: #f9f9f9;">
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">
                Pedido generado automáticamente desde ${empresaNombre}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function POST(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const domain = await getDomainFromHeaders();
    
    const subdomainPedidos = 'pedidos';
    const isPedidos = domain.startsWith(subdomainPedidos + '.') || domain.includes('-pedidos');
    const mainDomain = isPedidos 
      ? domain.replace(/^pedidos\./, '').replace(/-pedidos$/, '')
      : domain;

    const { data: empresa } = await supabase
      .from('empresas')
      .select('id, nombre, email_notification')
      .eq('dominio', mainDomain)
      .single();

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const { items, total, nombre, telefono } = body as { 
      items: CartItem[]; 
      total: number;
      nombre: unknown;
      telefono: unknown;
    };

    const sanitizedNombre = typeof nombre === 'string' ? nombre.trim().slice(0, 100) : '';
    const sanitizedTelefono = typeof telefono === 'string' ? telefono.replaceAll(/\D/g, '').slice(0, 15) : '';

    if (!sanitizedNombre || sanitizedNombre.length < 2) {
      return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
    }
    if (!/^[a-zA-ZÀ-ÿ\s'-]+$/u.test(sanitizedNombre)) {
      return NextResponse.json({ error: 'Nombre contiene caracteres inválidos' }, { status: 400 });
    }
    if (!sanitizedTelefono || sanitizedTelefono.length < 9) {
      return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
    }

    const { data: lastOrder } = await supabase
      .from('pedidos')
      .select('numero_pedido')
      .eq('empresa_id', empresa.id)
      .order('numero_pedido', { ascending: false })
      .limit(1)
      .single();

    const nuevoNumeroPedido = (lastOrder?.numero_pedido || 0) + 1;

    const { error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        empresa_id: empresa.id,
        numero_pedido: nuevoNumeroPedido,
        cliente_email: sanitizedNombre,
        cliente_telefono: sanitizedTelefono,
        detalle_pedido: items.map(ci => ({
          producto_id: ci.item.id,
          nombre: ci.item.name,
          precio: ci.item.price,
          cantidad: ci.quantity,
          complementos: ci.selectedComplements || [],
        })),
        total: total,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (pedidoError) {
      console.error('Error guardando pedido:', pedidoError);
      return NextResponse.json({ error: 'Error guardando pedido' }, { status: 500 });
    }

    if (RESEND_API_KEY && empresa.email_notification) {
      const safeNombre = typeof nombre === 'string' ? nombre : '';
      const safeTelefono = typeof telefono === 'string' ? telefono : '';
      const html = generateOrderEmail(items, total, empresa.nombre, nuevoNumeroPedido, safeNombre, safeTelefono);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Pedidos <pedidos@resend.dev>',
          to: empresa.email_notification,
          subject: `Nuevo pedido #${nuevoNumeroPedido} de ${safeNombre} - ${total.toFixed(2)}€`,
          html,
        }),
      });
    }

    return NextResponse.json({ success: true, numeroPedido: nuevoNumeroPedido });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
