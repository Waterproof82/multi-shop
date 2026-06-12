import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { initiateCustomTurnUseCase } from '@/core/application/use-cases/payment/initiateCustomTurnUseCase';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();

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

  // Resolve empresaId from active session
  const supabase = getSupabaseClient();
  const { data: sesion } = await supabase
    .from('mesa_sesiones').select('empresa_id')
    .eq('mesa_id', mesaId).is('cerrada_at', null).maybeSingle();
  const empresaId = (sesion as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  const result = await initiateCustomTurnUseCase({ mesaId, empresaId });
  if (!result.success) {
    const status = result.error.code === 'ALREADY_PAID' ? 409 : result.error.code === 'NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  if (!result.data.claimed) {
    return NextResponse.json({ error: 'Turno bloqueado — alguien está eligiendo' }, { status: 409 });
  }
  return NextResponse.json({ turnoId: result.data.turnoId }, { status: 200 });
}
