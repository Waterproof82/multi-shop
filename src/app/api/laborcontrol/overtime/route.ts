import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import { z } from 'zod';

const QuerySchema = z.object({
  from: z.string().date(),
  to:   z.string().date(),
  empleadoId: z.string().uuid().optional(),
});

// GET /api/laborcontrol/overtime?from=YYYY-MM-DD&to=YYYY-MM-DD
// Auth: requireRole admin | encargado
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'encargado', 'superadmin']);
  if (forbidden) return forbidden;

  const sp = new URL(req.url).searchParams;
  const parsed = QuerySchema.safeParse({
    from:       sp.get('from'),
    to:         sp.get('to'),
    empleadoId: sp.get('empleadoId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros from/to requeridos (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const db = getSupabaseClient();
    let query = db
      .from('lc_horas_extra')
      .select('*')
      .eq('empresa_id', ctx.empresaId)
      .gte('fecha', parsed.data.from)
      .lte('fecha', parsed.data.to)
      .order('fecha', { ascending: true });

    if (parsed.data.empleadoId) {
      query = query.eq('empleado_id', parsed.data.empleadoId);
    }

    const { data, error } = await query;
    if (error) {
      const appError = await logger.logFromCatch(error, 'api', 'GET /laborcontrol/overtime');
      return NextResponse.json({ error: appError.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'api', 'GET /laborcontrol/overtime');
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }
}
