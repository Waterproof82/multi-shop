import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogRepository } from '@/core/infrastructure/database';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';

export async function POST(req: NextRequest) {
  // Attempt to audit before clearing the token
  const empresaId = req.headers.get('x-empresa-id');
  const employeeId = req.headers.get('x-employee-id');
  if (empresaId) {
    const actor = resolveActor(req);
    void getAuditLogRepository().insert({
      empresaId,
      action: 'tpv.empleado.logout',
      payload: { empleadoId: employeeId ?? null },
      ...actor,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('tpv_employee_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
