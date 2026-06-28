import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const tokenSchema = z.object({
  fcm_token: z.string().min(1).max(500),
  role: z.enum(['waiter', 'kitchen']),
});

export async function POST(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('device_tokens').upsert(
    {
      empresa_id: empresaId,
      role: parsed.data.role,
      fcm_token: parsed.data.fcm_token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fcm_token' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to register token' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
