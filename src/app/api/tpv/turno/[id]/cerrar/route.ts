import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  errorResponse,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { cerrarTurnoUseCase } from '@/core/application/use-cases/tpv/cerrar-turno.use-case';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { z } from 'zod';

const repo = new SupabaseTpvRepository();

const CerrarSchema = z.object({
  efectivoCierreCents: z.number().int().min(0),
  totalEfectivoTeoricoCents: z.number().int().min(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CerrarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  // Guard: no cerrar si hay mesas con sesión abierta
  const supabase = getSupabaseClient();
  const { data: sesionesAbiertas } = await supabase
    .from('mesa_sesiones')
    .select('id')
    .eq('empresa_id', empresaId)
    .is('cerrada_at', null)
    .limit(1);

  if (sesionesAbiertas && sesionesAbiertas.length > 0) {
    return NextResponse.json(
      { error: 'Hay mesas sin cobrar. Cerrá o cobrá todas las mesas antes de cerrar el turno.' },
      { status: 409 },
    );
  }

  const result = await cerrarTurnoUseCase(repo, {
    turnoId: id,
    efectivoCierreCents: parsed.data.efectivoCierreCents,
    totalEfectivoTeoricoCents: parsed.data.totalEfectivoTeoricoCents,
  });

  if (!result.success) return errorResponse(result.error.message);
  return NextResponse.json({ ok: true });
}
