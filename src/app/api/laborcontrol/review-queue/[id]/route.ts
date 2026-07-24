import { NextRequest, NextResponse } from 'next/server';
import { getLcReviewQueueRepo } from '@/core/laborcontrol/infrastructure';
import { z } from 'zod';

const PatchSchema = z.object({
  estado: z.enum(['visto', 'disputado']),
});

// PATCH /api/laborcontrol/review-queue/[id]
// Auth: tpv_employee_token — employee marks their own item as visto or disputado
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const empleadoId = req.headers.get('x-employee-id');
  if (!empleadoId) {
    return NextResponse.json({ error: 'Sesión de empleado requerida' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const result = await getLcReviewQueueRepo().updateEstado(id, parsed.data.estado, empleadoId);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
