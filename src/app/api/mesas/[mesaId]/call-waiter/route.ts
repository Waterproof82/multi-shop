import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const mesaIdSchema = z.string().uuid();

/**
 * POST /api/mesas/{mesaId}/call-waiter
 *
 * Sets llamada_activa = true on the active session.
 * Called client-side when a customer taps the call-waiter button.
 * Fire-and-forget — failures are silently ignored on the client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mesaId' }, { status: 400 });

  // Tenant isolation: verify the mesa belongs to the empresa derived from the request domain
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) return NextResponse.json({ error: 'Tenant no identificado' }, { status: 400 });

  const supabase = getSupabaseClient();

  const { data: mesa } = await supabase
    .from('mesas')
    .select('id')
    .eq('id', parsed.data)
    .eq('empresa_id', empresaId)
    .single();

  if (!mesa) return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });

  await supabase
    .from('mesa_sesiones')
    .update({ llamada_activa: true })
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null);

  return NextResponse.json({ ok: true });
}
