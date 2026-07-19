import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  validationErrorResponse,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { registrarMovimientoCajaUseCase } from '@/core/application/use-cases/tpv/registrar-movimiento-caja.use-case';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';
import { z } from 'zod';

const repo = getTpvRepository();

const MovimientoSchema = z.object({
  tipoEvento: z.enum(['entrada_caja', 'salida_caja']),
  montoCents: z.number().int().min(1),
  descripcion: z.string().min(3).max(255),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  // Solo encargado/admin pueden mover efectivo — los cajeros no
  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const empleadoId =
    req.headers.get('x-admin-id') ?? req.headers.get('x-employee-id') ?? undefined;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = MovimientoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  const result = await registrarMovimientoCajaUseCase(repo, {
    turnoId: id,
    empresaId,
    tipoEvento: parsed.data.tipoEvento,
    montoCents: parsed.data.montoCents,
    descripcion: parsed.data.descripcion,
    empleadoId,
  });

  if (result.success) {
    const actor = resolveActor(req);
    void getAuditLogRepository().insert({
      empresaId,
      action: 'tpv.caja.movimiento',
      payload: {
        turnoId: id,
        tipo: parsed.data.tipoEvento,
        importeCents: parsed.data.montoCents,
      },
      ...actor,
    });
  }

  return handleResult(result);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  const { id } = await params;

  const result = await repo.getMovimientosCaja(id);
  return handleResult(result);
}
