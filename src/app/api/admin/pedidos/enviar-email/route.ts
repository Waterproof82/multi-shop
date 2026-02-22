import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

function generateOrderEmail(items: CartItem[], total: number, empresaNombre: string, numeroOrden: number, nombre: string, telefono: string): string {
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
              <p style="margin: 8px 0 0 0; color: #888; font-size: 14px;">Nuevo Pedido #${numeroOrden}</p>
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
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const domain = await getDomainFromHeaders();
    
    const subdomainPedidos = 'pedidos';
    const isPedidos = domain.startsWith(subdomainPedidos + '.') || domain.includes('-pedidos');
    const mainDomain = isPedidos 
      ? domain.replace(/^pedidos\./, '').replace(/-pedidos$/, '')
      : domain;

    const { data: empresa } = await supabase
      .from('empresas')
      .select('email_notification, nombre')
      .eq('dominio', mainDomain)
      .single();

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    if (!empresa.email_notification) {
      return NextResponse.json({ error: 'Email de notificación no configurado' }, { status: 400 });
    }

    const body = await request.json();
    const { items, total, numeroOrden, nombre, telefono } = body as { 
      items: CartItem[]; 
      total: number;
      numeroOrden?: number;
      nombre?: string;
      telefono?: string;
    };

    const html = generateOrderEmail(
      items, 
      total, 
      empresa.nombre, 
      numeroOrden || 1,
      nombre || 'Cliente',
      telefono || 'No proporcionado'
    );

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pedidos <pedidos@resend.dev>',
        to: empresa.email_notification,
        subject: `Nuevo pedido de ${empresa.nombre} - ${total.toFixed(2)}€`,
        html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json({ error: 'Error enviando email', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending order email:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
