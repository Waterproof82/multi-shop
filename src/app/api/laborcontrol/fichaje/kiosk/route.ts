import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/core/infrastructure/api/helpers';
import { getEmpleadoTpvLoginUseCase } from '@/core/infrastructure/database';
import { getLcRegistrarFichajeUseCase, getLcPerfilRepo, getLcFichajeRepo } from '@/core/laborcontrol/infrastructure';
import type { FichajeEvento } from '@/core/laborcontrol/domain/types';

const KioskSchema = z.object({
  pin:  z.string().min(4).max(8).regex(/^\d+$/, 'Solo dígitos'),
  tipo: z.enum(['entrada', 'salida', 'inicio_pausa', 'fin_pausa']).optional(),
});

function sugerirTipo(ultimo: FichajeEvento | null): 'entrada' | 'salida' | 'inicio_pausa' | 'fin_pausa' {
  if (ultimo === null) return 'entrada';
  const t = ultimo.tipo;
  if (t === 'entrada' || t === 'fin_pausa') return 'salida';
  if (t === 'inicio_pausa') return 'fin_pausa';
  return 'entrada';
}

// POST /api/laborcontrol/fichaje/kiosk
// Phase 1 — { pin }:        → { step: 'identify', nombre, empleadoId, sugerido }
// Phase 2 — { pin, tipo }:  → { step: 'done', nombre, tipo, timestampServidor }
//
// Auth: any valid TPV session (admin_token OR tpv_employee_token).
// PIN re-validates employee identity on every call — no x-employee-id required.
export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = KioskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN requerido (4–8 dígitos)' }, { status: 400 });
  }

  // Validate PIN → resolve employee identity
  const loginResult = await getEmpleadoTpvLoginUseCase().execute(parsed.data.pin, empresaId);
  if (!loginResult.success) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }
  const { empleadoId, nombre } = loginResult.data;

  // Phase 1 — lookup only (no tipo provided)
  if (parsed.data.tipo === undefined) {
    const ultimoResult = await getLcFichajeRepo().findUltimoByEmpleado(empresaId, empleadoId);
    const sugerido = sugerirTipo(ultimoResult.success ? ultimoResult.data : null);
    return NextResponse.json({ step: 'identify', nombre, empleadoId, sugerido });
  }

  // Phase 2 — register fichaje
  const tipo = parsed.data.tipo;

  const perfilResult = await getLcPerfilRepo().findAllByEmpresa(empresaId, true);
  const perfil = perfilResult.success
    ? perfilResult.data.find(p => p.empleadoId === empleadoId)
    : undefined;
  if (!perfil) {
    return NextResponse.json({ error: 'El empleado no tiene perfil laboral activo' }, { status: 404 });
  }

  const result = await getLcRegistrarFichajeUseCase().execute({
    empresaId,
    centroId:        perfil.centroId,
    empleadoId,
    actorId:         empleadoId,
    tipo,
    timestampEvento: new Date(),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message ?? 'Error al fichar' }, { status: 500 });
  }

  return NextResponse.json({
    step:              'done',
    nombre,
    tipo,
    timestampServidor: result.data.timestampServidor.toISOString(),
    orphanDetected:    result.data.orphanDetected,
  });
}
