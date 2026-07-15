import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { getEmpleadoTpvLoginUseCase } from '@/core/infrastructure/database';
import { signTpvEmployeeToken } from '@/lib/tpv-employee-auth';

const LoginSchema = z.object({
  pin: z.string().min(4).max(8).regex(/^\d+$/, 'Solo dígitos'),
});

export async function POST(req: NextRequest) {
  const rateLimited = await rateLimitAdmin(req);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);

  const supabase = getSupabaseClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('dominio', mainDomain)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 });
  }

  const result = await getEmpleadoTpvLoginUseCase().execute(parsed.data.pin, empresa.id as string);
  if (!result.success) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }

  const token = await signTpvEmployeeToken(result.data);
  const nextUrl = result.data.rol === 'cajero' ? '/tpv/mostrador' : '/tpv/turno/abrir';

  const response = NextResponse.json({ ok: true, nextUrl, rol: result.data.rol });
  response.cookies.set('tpv_employee_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
