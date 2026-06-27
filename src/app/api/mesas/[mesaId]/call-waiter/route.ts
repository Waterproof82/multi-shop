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

  const supabase = getSupabaseClient();

  await supabase
    .from('mesa_sesiones')
    .update({ llamada_activa: true })
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null);

  return NextResponse.json({ ok: true });
}
