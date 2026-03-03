import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { sendEmail } from '@/lib/brevo-email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

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

function generateWhatsAppMessage(items: CartItem[], total: number, nombre: string, numeroPedido: number): string {
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

function parseMainDomain(domain: string): string {
  const subdomainPedidos = 'pedidos';
  const isPedidos = domain.startsWith(subdomainPedidos + '.') || domain.includes('-pedidos');
  return isPedidos
    ? domain.replace(/^pedidos\./, '').replace(/-pedidos$/, '')
    : domain;
}

async function getDomainFromHeaders(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host');
  if (!host) return '';
  return host.replace(/^www\./, '').toLowerCase().split(':')[0];
}

interface OrderEmailParams {
  readonly items: CartItem[];
  readonly total: number;
  readonly empresaNombre: string;
  readonly numeroPedido: number;
  readonly nombre: string;
  readonly telefono: string;
  readonly email: string | null;
  readonly whatsappLink?: string;
}

function generateOrderEmail(params: OrderEmailParams): string {
  const { items, total, empresaNombre, numeroPedido, nombre, telefono, email, whatsappLink } = params;
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
                    ${email ? `<p style="margin: 8px 0 0 0; color: #333; font-size: 14px;"><strong>Email:</strong> ${email}</p>` : ''}
                    ${whatsappLink ? `<p style="margin: 8px 0 0 0; font-size: 14px;"><a href="${whatsappLink}" style="background-color: #25D366; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600;">📱 Enviar WhatsApp</a></p>` : ''}
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

function validateOrderInputs(nombre: unknown, telefono: unknown, email?: string) {
  const sanitizedNombre = typeof nombre === 'string' ? nombre.trim().slice(0, 100) : '';
  const sanitizedTelefono = typeof telefono === 'string' ? telefono.replaceAll(/\D/g, '').slice(0, 15) : '';
  const sanitizedEmail = typeof email === 'string' && email.trim()
    ? email.trim().toLowerCase().slice(0, 100)
    : null;

  if (!sanitizedNombre || sanitizedNombre.length < 2) {
    return { error: 'Nombre inválido', status: 400 };
  }
  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/u.test(sanitizedNombre)) {
    return { error: 'Nombre contiene caracteres inválidos', status: 400 };
  }
  if (!sanitizedTelefono || sanitizedTelefono.length < 9) {
    return { error: 'Teléfono inválido', status: 400 };
  }
  return {
    sanitizedNombre,
    sanitizedTelefono,
    sanitizedEmail,
  };
}



async function upsertClienteByTelefono(supabase: any, empresaId: string, nombre: string, telefono: string, email?: string): Promise<string | null> {
  // Buscar cliente existente por teléfono
  const { data: existingCliente } = await supabase
    .from('clientes')
    .select('id, email, nombre')
    .eq('empresa_id', empresaId)
    .eq('telefono', telefono)
    .single();
  
  if (existingCliente) {
    // Actualizar solo nombre y email (si no está vacío)
    const updates: any = {};
    if (nombre) updates.nombre = nombre;
    if (email) updates.email = email;
    
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('clientes')
        .update(updates)
        .eq('id', existingCliente.id);
    }
    return existingCliente.id;
  } else {
    // Crear nuevo cliente
    const { data: newCliente, error: clienteError } = await supabase
      .from('clientes')
      .insert({
        empresa_id: empresaId,
        nombre: nombre || null,
        telefono: telefono,
        email: email || null,
      })
      .select('id')
      .single();
    if (!clienteError && newCliente) {
      return newCliente.id;
    }
  }
  return null;
}

async function upsertCliente(supabase: any, empresaId: string, nombre: string, telefono: string, email?: string | null): Promise<string | null> {
  // Siempre buscar por teléfono primero
  return upsertClienteByTelefono(supabase, empresaId, nombre, telefono, email || undefined);
}

async function createPedido(supabase: any, empresaId: string, clienteId: string | null, items: CartItem[], total: number) {
  const { data: lastOrder } = await supabase
    .from('pedidos')
    .select('numero_pedido')
    .eq('empresa_id', empresaId)
    .order('numero_pedido', { ascending: false })
    .limit(1)
    .single();
  const nuevoNumeroPedido = (lastOrder?.numero_pedido || 0) + 1;
  const { error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      empresa_id: empresaId,
      numero_pedido: nuevoNumeroPedido,
      cliente_id: clienteId,
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
  return { pedidoError, nuevoNumeroPedido };
}


type OrderEmailInfo = {
  empresa: any;
  clienteId: string | null;
  sanitizedNombre: string;
  sanitizedTelefono: string;
  sanitizedEmail: string | null;
  items: CartItem[];
  total: number;
  nuevoNumeroPedido: number;
  whatsappLink?: string;
};

async function sendOrderEmail(supabase: any, info: OrderEmailInfo) {
  let safeNombre = info.sanitizedNombre;
  let safeTelefono = info.sanitizedTelefono;
  let safeEmail = info.sanitizedEmail;
  if (info.clienteId) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, telefono, email')
      .eq('id', info.clienteId)
      .single();
    if (cliente) {
      safeNombre = cliente.nombre || safeNombre;
      safeTelefono = cliente.telefono || safeTelefono;
      safeEmail = cliente.email || safeEmail;
    }
  }
  const html = generateOrderEmail({
    items: info.items,
    total: info.total,
    empresaNombre: info.empresa.nombre,
    numeroPedido: info.nuevoNumeroPedido,
    nombre: safeNombre,
    telefono: safeTelefono,
    email: safeEmail,
    whatsappLink: info.whatsappLink
  });
  await sendEmail({
    to: info.empresa.email_notification,
    subject: `Nuevo pedido #${info.nuevoNumeroPedido} de ${safeNombre} - ${info.total.toFixed(2)}€`,
    htmlContent: html,
    senderName: info.empresa.nombre,
    senderEmail: info.empresa.email_notification,
  });
}

export async function POST(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const domain = await getDomainFromHeaders();
    const mainDomain = parseMainDomain(domain);

    let { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('id, nombre, email_notification, telefono_whatsapp')
      .eq('dominio', mainDomain)
      .single();

    // Si no encuentra, buscar por subdomain pedidos
    if (empresaError || !empresa) {
      const subdomainPedidos = 'pedidos';
      const isPedidos = domain.startsWith(`${subdomainPedidos}.`) || domain.includes('-pedidos');
      
      if (isPedidos) {
        // Extraer el dominio principal del subdominio
        const mainDomainFromSubdomain = domain.split('.').slice(1).join('.');
        
        const { data: empresaSubdomain } = await supabase
          .from('empresas')
          .select('id, nombre, email_notification, telefono_whatsapp')
          .eq('dominio', mainDomainFromSubdomain)
          .single();
        
        if (empresaSubdomain) empresa = empresaSubdomain;
      }
    }

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const { items, total, nombre, telefono, email } = body as {
      items: CartItem[];
      total: number;
      nombre: unknown;
      telefono: unknown;
      email?: string;
    };

    const validation = validateOrderInputs(nombre, telefono, email);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const { sanitizedNombre, sanitizedTelefono, sanitizedEmail } = validation;

    const clienteId = await upsertCliente(supabase, empresa.id, sanitizedNombre, sanitizedTelefono, sanitizedEmail);

    const { pedidoError, nuevoNumeroPedido } = await createPedido(supabase, empresa.id, clienteId, items, total);
    if (pedidoError) {
      console.error('Error guardando pedido:', pedidoError);
      return NextResponse.json({ error: 'Error guardando pedido' }, { status: 500 });
    }

    let whatsappLink: string | undefined;
    if (empresa.telefono_whatsapp) {
      const telefonoLimpio = empresa.telefono_whatsapp.replaceAll(/\D/g, '');
      const mensaje = generateWhatsAppMessage(items, total, sanitizedNombre, nuevoNumeroPedido);
      whatsappLink = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
    }

    return NextResponse.json({ success: true, numeroPedido: nuevoNumeroPedido, whatsappLink });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
