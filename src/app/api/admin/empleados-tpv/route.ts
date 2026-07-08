import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { empleadoTpvRepository } from '@/core/infrastructure/database';
import { hashPin } from '@/lib/waiter-auth';
import { z } from 'zod';

const CreateSchema = z.object({
  nombre: z.string().min(2).max(80),
  rol: z.enum(['cajero', 'encargado']),
  pin: z.string().min(4).max(8).regex(/^\d+$/, 'Solo dígitos'),
});

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const result = await empleadoTpvRepository.findAllByEmpresa(empresaId);
  if (!result.success) return handleResult(result);
  const safeList = result.data.map(({ pinHash: _, ...rest }) => rest);
  return NextResponse.json(safeList);
}

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pinHash = await hashPin(parsed.data.pin, empresaId);

  const result = await empleadoTpvRepository.create({
    empresaId,
    nombre: parsed.data.nombre,
    rol: parsed.data.rol,
    pinHash,
  });

  if (!result.success) {
    const msg = result.error.message.includes('unique') || result.error.message.includes('duplicate')
      ? 'Este PIN ya está en uso. Elige uno diferente.'
      : result.error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const { pinHash: _, ...safe } = result.data;
  return NextResponse.json(safe, { status: 201 });
}
