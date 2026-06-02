import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();
const LOCK_EXPIRY_MS = 15 * 60 * 1000;

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
 * Returns 423 if another fresh lock is already active.
 */
export async function POST(
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

  if (lock?.pago_en_curso && lockAge < LOCK_EXPIRY_MS) {
    return NextResponse.json({ error: 'Hay un pago en curso en esta mesa.' }, { status: 423 });
  }

  await supabase
    .from('mesa_sesiones')
    .update({ pago_en_curso: true, pago_iniciado_en: new Date().toISOString() })
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null);

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
