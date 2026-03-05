import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    return NextResponse.json({ success: true, numeroPedido: nuevoNumeroPedido, whatsappLink, companyPhone: empresa.telefono_whatsapp });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
