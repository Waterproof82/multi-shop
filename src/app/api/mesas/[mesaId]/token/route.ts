import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMesaClientTokenUseCase } from '@/core/infrastructure/database';
import { rateLimitMesaTokenIssuance } from '@/core/infrastructure/api/rate-limit';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const rateLimited = await rateLimitMesaTokenIssuance(parsed.data);
  if (rateLimited) return rateLimited;

  const result = await getMesaClientTokenUseCase().issueToken(parsed.data);

  if (!result.success) {
    if (result.error.code === 'SESSION_NOT_ACTIVE') {
      return NextResponse.json({ error: result.error.message, code: 'SESSION_NOT_ACTIVE' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Error al emitir token' }, { status: 500 });
  }

  return NextResponse.json({ token: result.data.token, expiresAt: result.data.expiresAt });
}
