import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({
  paymentOrderRef: z.string().min(1).max(50),
});

/**
 * DELETE — release a pending division slot.
 *
 * Called client-side when the user returns to the ticket after cancelling or
 * abandoning the Redsys payment flow. Atomically marks the row as 'failed'
 * only if it is still 'pending' — a no-op if the webhook already set it to
 * 'paid' or 'failed'.
 *
 * The paymentOrderRef is stored in sessionStorage by the client after a
 * successful division payment initiation, so only the originating device
 * knows the ref.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const parsedId = mesaIdSchema.safeParse(mesaId);
  if (!parsedId.success) return NextResponse.json({ ok: true });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: true }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

  try {
    const supabase = getSupabaseClient();

    const { data: sesion } = await supabase
      .from('mesa_sesiones')
      .select('id')
      .eq('mesa_id', parsedId.data)
      .is('cerrada_at', null)
      .maybeSingle();

    if (!sesion) return NextResponse.json({ ok: true });

    // Atomically release the slot — only if still pending.
    // If the webhook already marked it 'paid', this is a no-op.
    await supabase
      .from('mesa_division_pagos')
      .update({ status: 'failed' })
      .eq('sesion_id', (sesion as { id: string }).id)
      .eq('payment_order_ref', parsed.data.paymentOrderRef)
      .eq('status', 'pending');

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // never block the client
  }
}
