import { NextResponse } from 'next/server';

// Función helper para obtener base URL
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 
         process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'vercel.app') ||
         'https://www.almadearena.es';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');

    if (!email || !empresaId) {
      return NextResponse.redirect(`${getBaseUrl()}/?error=invalid`);
    }

    const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
    const supabase = getSupabaseClient();

    // Buscar cliente por email y empresa
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('email', email)
      .single();

    if (clienteError || !cliente) {
      return NextResponse.redirect(`${getBaseUrl()}/?error=notfound`);
    }

    // Toggle: cambiar valor de aceptar_promociones
    const nuevoValor = !cliente.aceptar_promociones;

    await supabase
      .from('clientes')
      .update({ aceptar_promociones: nuevoValor })
      .eq('id', cliente.id);

    const mensaje = nuevoValor ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${getBaseUrl()}/?${mensaje}`);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.redirect(`${getBaseUrl()}/?error=internal`);
  }
}
