import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { verifyPin, signWaiterToken } from '@/lib/waiter-auth';
import { rateLimitWaiterLogin } from '@/core/infrastructure/api/rate-limit';

const authSchema = z.object({
  pin: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  const rateLimited = await rateLimitWaiterLogin(request);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);

  // Fetch empresa with waiter_pin_hash — uses service-role client (sensitive field)
  const supabase = getSupabaseClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, waiter_pin_hash')
    .eq('dominio', mainDomain)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  if (!empresa.waiter_pin_hash) {
    return NextResponse.json({ error: 'Panel de camarero no configurado' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = authSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const isValid = await verifyPin(parsed.data.pin, empresa.id as string, empresa.waiter_pin_hash as string);
  if (!isValid) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }

  const token = await signWaiterToken(empresa.id as string);

  const response = NextResponse.json({ ok: true, empresaId: empresa.id as string });
  response.cookies.set('waiter_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 43200, // 12 hours
  });

  return response;
}
