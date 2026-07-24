import { NextRequest, NextResponse } from 'next/server';
import { getLcReviewQueueRepo } from '@/core/laborcontrol/infrastructure';
import { handleResult } from '@/core/infrastructure/api/helpers';

// GET /api/laborcontrol/review-queue
// Auth: tpv_employee_token — returns items for the authenticated employee
export async function GET(req: NextRequest) {
  const empresaId  = req.headers.get('x-empresa-id');
  const empleadoId = req.headers.get('x-employee-id');

  if (!empresaId || !empleadoId) {
    return NextResponse.json({ error: 'Sesión de empleado requerida' }, { status: 403 });
  }

  const result = await getLcReviewQueueRepo().findByEmpleado(empresaId, empleadoId);
  return handleResult(result);
}
