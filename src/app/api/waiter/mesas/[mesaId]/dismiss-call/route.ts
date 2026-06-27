import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

/**
 * POST /api/waiter/mesas/{mesaId}/dismiss-call
 *
 * Sets llamada_activa = false on the active session.
 * Called when the waiter acknowledges and dismisses the call indicator.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const supabase = getSupabaseClient();

  await supabase
    .from('mesa_sesiones')
    .update({ llamada_activa: false })
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null);

  return NextResponse.json({ ok: true });
}
