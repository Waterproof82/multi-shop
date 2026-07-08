import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { empleadoTpvRepository } from '@/core/infrastructure/database';
import { hashPin } from '@/lib/waiter-auth';
import { z } from 'zod';

const PatchSchema = z.union([
  z.object({ pin: z.string().min(4).max(8).regex(/^\d+$/) }),
  z.object({ activo: z.boolean() }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let result;
  if ('pin' in parsed.data) {
    const pinHash = await hashPin(parsed.data.pin, empresaId);
    result = await empleadoTpvRepository.updatePin(id, empresaId, pinHash);
  } else {
    result = await empleadoTpvRepository.setActivo(id, empresaId, parsed.data.activo);
  }

  if (!result.success) {
    const msg = result.error.message.includes('unique') || result.error.message.includes('duplicate')
      ? 'Este PIN ya está en uso. Elige uno diferente.'
      : result.error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const { id } = await params;
  const result = await empleadoTpvRepository.delete(id, empresaId);

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
