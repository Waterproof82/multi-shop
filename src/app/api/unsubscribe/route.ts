import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');
    const action = searchParams.get('action');

    if (!email || !empresaId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.almadearena.es'}/?error=invalid`);
    }

    // Decode email if it's URL encoded
    try {
      email = decodeURIComponent(email);
    } catch (e) {
      // Keep original if decode fails
    }
    
    // Normalizar email: trim, lowercase
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar cliente por empresa + email
    let clienteToUpdate = null;
    
    // Try case insensitive with normalized email
    const { data: cliente1 } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .ilike('email', normalizedEmail)
      .single();
    
    if (cliente1) {
      clienteToUpdate = cliente1;
    } else {
      // Try exact match
      const { data: cliente2 } = await supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('email', normalizedEmail)
        .single();
      
      if (cliente2) {
        clienteToUpdate = cliente2;
      }
    }

    if (!clienteToUpdate) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.almadearena.es'}/?error=notfound`);
    }

    // Determinar nuevo valor según acción
    let nuevoValor: boolean;
    
    if (action === 'alta') {
      nuevoValor = true; // Darse de alta
    } else if (action === 'baja') {
      nuevoValor = false; // Darse de baja
    } else {
      // Default: toggle
      nuevoValor = !clienteToUpdate.aceptar_promociones;
    }

    await supabase
      .from('clientes')
      .update({ aceptar_promociones: nuevoValor })
      .eq('id', clienteToUpdate.id);

    // Redirigir con mensaje
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.almadearena.es';
    const mensaje = nuevoValor ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${baseUrl}/?${mensaje}`);
  } catch (error) {
    console.error('Promo error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.almadearena.es'}/?error=internal`);
  }
}
