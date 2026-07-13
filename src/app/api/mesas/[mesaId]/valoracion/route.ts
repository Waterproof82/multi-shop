import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMesaSesionRepository, getValoracionUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({
  estrellas: z.number().min(0.5).max(5).multipleOf(0.5),
  sesion_id: z.string().uuid(),
  rater_id: z.string().uuid(),
});

export async function POST(
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

  const sesionResult = await getMesaSesionRepository().findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  const result = await getValoracionUseCase().create({
    empresaId: sesionResult.data.empresaId,
    mesaId: mesaParsed.data,
    mesaSesionId: bodyParsed.data.sesion_id,
    raterId: bodyParsed.data.rater_id,
    estrellas: bodyParsed.data.estrellas,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Error al guardar la valoración' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
