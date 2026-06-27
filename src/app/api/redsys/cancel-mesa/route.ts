import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const schema = z.object({
  mesaId: z.string().uuid(),
  redirect: z.string().default('/'),
});

/**
 * Redsys urlKo handler — called when payment is cancelled or fails at Redsys.
 * Releases the session payment lock so users can retry or add more items.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = schema.safeParse({
    mesaId: sp.get('mesaId'),
    redirect: sp.get('redirect') ?? '/',
  });

  if (parsed.success) {
    try {
      const supabase = getSupabaseClient();

      // Fetch the session to check for an active custom turn
      const { data: sesionRow } = await supabase
        .from('mesa_sesiones')
        .select('id, custom_turno_id')
        .eq('mesa_id', parsed.data.mesaId)
        .is('cerrada_at', null)
        .maybeSingle();

      const row = sesionRow as { id: string; custom_turno_id: string | null } | null;

      if (row?.custom_turno_id) {
        // Custom turn payment cancelled — release the lock atomically via RPC
        // (sets pago_en_curso=false, custom_turno_id=null, status=cancelado)
        await supabase.rpc('cancel_custom_turn', { p_turno_id: row.custom_turno_id });
      } else {
        // Regular full/division payment cancelled — just clear the lock flag
        await supabase
          .from('mesa_sesiones')
          .update({ pago_en_curso: false, pago_iniciado_en: null })
          .eq('mesa_id', parsed.data.mesaId)
          .is('cerrada_at', null);
      }
    } catch {
      // Never block the redirect
    }
  }

  const redirectTo = parsed.success ? parsed.data.redirect : '/';
  return NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
}
