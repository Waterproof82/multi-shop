import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { getEmpleadoTpvLoginUseCase, getAuditLogRepository } from '@/core/infrastructure/database';
import { signTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';
import { generateCsrfToken, signCsrfToken } from '@/lib/csrf';

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

  const empresaId = empresa.id as string;
  const result = await getEmpleadoTpvLoginUseCase().execute(parsed.data.pin, empresaId);
  if (!result.success) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }

  const actor = resolveActor(req, result.data.empleadoId);
  void getAuditLogRepository().insert({
    empresaId,
    action: 'tpv.empleado.login',
    payload: { empleadoId: result.data.empleadoId, rol: result.data.rol },
    ...actor,
  });

  const token = await signTpvEmployeeToken(result.data);
  const nextUrl = result.data.rol === 'cajero' ? '/tpv/mostrador' : '/tpv/turno/abrir';

  const csrfToken = generateCsrfToken();
  const csrfSignature = signCsrfToken(csrfToken);

  const response = NextResponse.json({ ok: true, nextUrl, rol: result.data.rol });
  response.cookies.set('tpv_employee_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  response.cookies.set('csrf_token', `${csrfToken}:${csrfSignature}`, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
