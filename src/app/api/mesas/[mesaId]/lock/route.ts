import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { PAYMENT_LOCK_EXPIRY_MS } from '@/core/domain/constants/pedido';

const mesaIdSchema = z.string().uuid();
const LOCK_EXPIRY_MS = PAYMENT_LOCK_EXPIRY_MS;

type LockRow = { pago_en_curso: boolean; pago_iniciado_en: string | null } | null;

async function getMesaId(params: Promise<{ mesaId: string }>) {
  const { mesaId } = await params;
  return mesaIdSchema.safeParse(mesaId);
}

/**
 * GET — return current lock status for this mesa (waiter use).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const parsed = await getMesaId(params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mesaId' }, { status: 400 });

  const supabase = getSupabaseClient();
  const { data: row } = await supabase
    .from('mesa_sesiones')
    .select('pago_en_curso, pago_iniciado_en')
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null)
    .maybeSingle();

  const lock = row as LockRow;
  const lockAge = lock?.pago_iniciado_en
    ? Date.now() - new Date(lock.pago_iniciado_en).getTime()
    : Infinity;
  const active = !!(lock?.pago_en_curso && lockAge < LOCK_EXPIRY_MS);

  return NextResponse.json({ pago_en_curso: active, pago_iniciado_en: lock?.pago_iniciado_en ?? null });
}

/**
 * POST — claim the payment lock for this mesa.
 * Uses an atomic DB-level CAS via acquire_mesa_lock() to eliminate the
 * read-then-write race condition. Returns 423 if another fresh lock is active.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const parsed = await getMesaId(params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mesaId' }, { status: 400 });

  const supabase = getSupabaseClient();

  const { data: acquired, error } = await supabase.rpc('acquire_mesa_lock', {
    p_mesa_id: parsed.data,
  });

  if (error) {
    return NextResponse.json({ error: 'DB error acquiring lock' }, { status: 500 });
  }

  if (!acquired) {
    return NextResponse.json({ error: 'Hay un pago en curso en esta mesa.' }, { status: 423 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE — release the payment lock (called when user cancels before submitting to Redsys).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const parsed = await getMesaId(params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mesaId' }, { status: 400 });

  const supabase = getSupabaseClient();

  await supabase
    .from('mesa_sesiones')
    .update({ pago_en_curso: false, pago_iniciado_en: null })
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null);

  return NextResponse.json({ ok: true });
}
