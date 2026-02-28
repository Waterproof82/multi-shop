import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');

    if (!email || !empresaId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=invalid`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar cliente por email y empresa
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('email', email)
      .single();

    if (clienteError || !cliente) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=notfound`);
    }

    // Toggle: cambiar valor de aceptar_promociones
    const nuevoValor = !cliente.aceptar_promociones;

    await supabase
      .from('clientes')
      .update({ aceptar_promociones: nuevoValor })
      .eq('id', cliente.id);

    // Redirigir con mensaje
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const mensaje = nuevoValor ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${baseUrl}/?${mensaje}`);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=internal`);
  }
}
