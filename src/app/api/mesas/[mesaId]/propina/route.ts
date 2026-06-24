import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({
  propinaCents: z.number().int().min(0).max(5000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const mesaParsed = mesaIdSchema.safeParse(mesaId);
  if (!mesaParsed.success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const bodyParsed = bodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: bodyParsed.error.errors[0].message }, { status: 400 });
  }

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('mesa_sesiones')
    .update({ propina_cents: bodyParsed.data.propinaCents })
    .eq('id', sesionResult.data.id);

  if (error) {
    return NextResponse.json({ error: 'Error al guardar la propina' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
