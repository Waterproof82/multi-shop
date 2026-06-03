import { NextResponse } from 'next/server';
import { mesaClientTokenUseCase } from '@/core/infrastructure/database';

/**
 * Validates the mesa client token from the Authorization header.
 * Returns NextResponse with 401 if invalid, or null if valid.
 * The error code is included so the client can decide whether to show
 * the QR scanner (TOKEN_EXPIRED, NOT_FOUND) or a "closed" message (SESSION_CLOSED).
 */
export async function validateMesaClientToken(request: Request): Promise<NextResponse | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Token requerido', code: 'NOT_FOUND' }, { status: 401 });
  }

  const result = await mesaClientTokenUseCase.validateToken(token);

  if (!result.success) {
    return NextResponse.json({ error: 'Error al validar token' }, { status: 500 });
  }

  if (!result.data.valid) {
    return NextResponse.json(
      { error: 'Token inválido', code: result.data.code },
      { status: 401 }
    );
  }

  return null;
}
