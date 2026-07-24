import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getLcObtenerMisFichajesUseCase } from '@/core/laborcontrol/infrastructure';
import { z } from 'zod';

const QuerySchema = z.object({
  from: z.string().date(),
  to:   z.string().date(),
});

// GET /api/laborcontrol/fichajes/[empleadoId]?from=YYYY-MM-DD&to=YYYY-MM-DD
// Auth: own employee session OR admin/encargado
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empleadoId: string }> },
) {
  const { empleadoId } = await params;

  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const sessionEmpleadoId = req.headers.get('x-employee-id');
  const isOwnRecord = sessionEmpleadoId === empleadoId;

  if (!isOwnRecord) {
    const forbidden = requireRole(req, ['admin', 'encargado', 'superadmin']);
    if (forbidden) return forbidden;
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: searchParams.get('from'),
    to:   searchParams.get('to'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros from/to requeridos (YYYY-MM-DD)' }, { status: 400 });
  }

  const uc = getLcObtenerMisFichajesUseCase();
  const result = await uc.execute(
    empresaId,
    empleadoId,
    new Date(parsed.data.from),
    new Date(parsed.data.to + 'T23:59:59.999Z'),
  );

  return handleResult(result);
}
