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
      await supabase
        .from('mesa_sesiones')
        .update({ pago_en_curso: false, pago_iniciado_en: null })
        .eq('mesa_id', parsed.data.mesaId)
        .is('cerrada_at', null);
    } catch {
      // Never block the redirect
    }
  }

  const redirectTo = parsed.success ? parsed.data.redirect : '/';
  return NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
}
