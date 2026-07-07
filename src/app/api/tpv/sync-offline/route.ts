import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { registrarCobroUseCase } from '@/core/application/use-cases/tpv/registrar-cobro.use-case';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { z } from 'zod';

const EntrySchema = z.object({
  id: z.string().max(64),
  sesionId: z.string().uuid(),
  mesaNumero: z.number().int().positive(),
  metodoPago: z.enum(['efectivo', 'tarjeta']),
  importeCobradoCents: z.number().int().positive(),
  propinaCents: z.number().int().min(0),
  descuentoCents: z.number().int().min(0).default(0),
  operadorNombre: z.string().max(100),
  turnoId: z.string().uuid(),
  empresaId: z.string().uuid(),
  ivaPorcentaje: z.number().min(0).max(30).default(10),
  ts: z.number(),
});

const BodySchema = z.object({
  entries: z.array(EntrySchema).max(100),
});

type SyncStatus = 'ok' | 'revision' | 'error';

interface SyncResult {
  id: string;
  status: SyncStatus;
}

async function processEntry(
  entry: z.infer<typeof EntrySchema>,
  empresaId: string,
): Promise<SyncResult> {
  if (entry.empresaId !== empresaId) {
    return { id: entry.id, status: 'error' };
  }

  const supabase = getSupabaseClient();
  const { data: sesion } = await supabase
    .from('mesa_sesiones')
    .select('id, cierre_at')
    .eq('id', entry.sesionId)
    .maybeSingle();

  const isOpen = sesion !== null && sesion.cierre_at === null;

  const repo = new SupabaseTpvRepository();
  const cobroResult = await registrarCobroUseCase(repo, {
    empresaId: entry.empresaId,
    sesionId: entry.sesionId,
    metodoPago: entry.metodoPago,
    importeCobradoCents: entry.importeCobradoCents,
    propinaCents: entry.propinaCents,
    descuentoCents: entry.descuentoCents,
    turnoId: entry.turnoId,
    ivaPorcentaje: entry.ivaPorcentaje,
    cerrarSesion: isOpen,
  });

  if (!cobroResult.success) {
    return { id: entry.id, status: 'error' };
  }

  if (!isOpen) {
    await supabase
      .from('tpv_turnos')
      .update({ requiere_revision: true })
      .eq('id', entry.turnoId);
    return { id: entry.id, status: 'revision' };
  }

  return { id: entry.id, status: 'ok' };
}

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const results: SyncResult[] = [];
  for (const entry of parsed.data.entries) {
    const result = await processEntry(entry, empresaId);
    results.push(result);
  }

  return NextResponse.json({ results });
}
