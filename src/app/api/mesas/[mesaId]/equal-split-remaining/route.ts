import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { switchToEqualSplitRemainingUseCase } from '@/core/application/use-cases/payment/switchToEqualSplitRemainingUseCase';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({
  numPersonas: z.number().int().min(2).max(20),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  if (!mesaIdSchema.safeParse(mesaId).success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });
  }

  // Resolve empresaId from active session
  const supabase = getSupabaseClient();
  const { data: sesion } = await supabase
    .from('mesa_sesiones').select('empresa_id')
    .eq('mesa_id', mesaId).is('cerrada_at', null).maybeSingle();
  const empresaId = (sesion as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  const result = await switchToEqualSplitRemainingUseCase({
    mesaId,
    empresaId,
    numPersonas: parsedBody.data.numPersonas,
  });

  if (!result.success) {
    const status = result.error.code === 'TURN_ACTIVE' ? 409
      : result.error.code === 'NOT_FOUND' ? 404
      : result.error.code === 'FORBIDDEN' ? 403
      : result.error.code === 'INVALID_PERSONAS' ? 400
      : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.json({ importePorPersonaCents: result.data.importe_por_persona_cents });
}
