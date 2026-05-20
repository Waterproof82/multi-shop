import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoRepository } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const tokenSchema = z.string().uuid();

export async function GET(request: Request) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const result = await pedidoRepository.findByTrackingToken(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al buscar pedido' }, { status: 500 });
  }

  if (!result.data) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    numero_pedido: result.data.numero_pedido,
    estimated_minutes: result.data.estimated_minutes,
    estimated_ready_at: result.data.estimated_ready_at,
  });
}
