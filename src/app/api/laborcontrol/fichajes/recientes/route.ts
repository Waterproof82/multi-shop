import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

// GET /api/laborcontrol/fichajes/recientes
// Returns last 30 fichajes (all employees) for the company — kiosk feed
export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('lc_fichajes')
    .select('record_id, empleado_id, tipo, timestamp_evento, timestamp_servidor')
    .eq('empresa_id', empresaId)
    .gte('timestamp_servidor', since.toISOString())
    .neq('tipo', 'correccion')
    .order('timestamp_servidor', { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{
    record_id: string;
    empleado_id: string;
    tipo: string;
    timestamp_evento: string;
    timestamp_servidor: string;
  }>;

  const empleadoIds = [...new Set(rows.map(r => r.empleado_id))];
  const { data: empleados } = empleadoIds.length > 0
    ? await supabase.from('empleados_tpv').select('id, nombre').in('id', empleadoIds)
    : { data: [] };

  const nombreMap = new Map(
    ((empleados ?? []) as Array<{ id: string; nombre: string }>).map(e => [e.id, e.nombre])
  );

  return NextResponse.json(
    rows.map(r => ({
      recordId:          r.record_id,
      empleadoId:        r.empleado_id,
      empleadoNombre:    nombreMap.get(r.empleado_id) ?? r.empleado_id,
      tipo:              r.tipo,
      timestampEvento:   r.timestamp_evento,
      timestampServidor: r.timestamp_servidor,
    }))
  );
}
