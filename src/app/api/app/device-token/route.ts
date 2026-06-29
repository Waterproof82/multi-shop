import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { rateLimitLogin } from '@/core/infrastructure/api/rate-limit';

const schema = z.object({
  fcm_token: z.string().min(1).max(500),
  role: z.enum(['waiter', 'kitchen']),
  empresa_id: z.string().uuid(),
});

// Public endpoint — called from the local Capacitor setup page where
// the waiter_token cookie doesn't exist yet. Push tokens are not sensitive
// (receive-only), so no auth is required. Rate-limited to prevent abuse.
export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitLogin(request);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('device_tokens').upsert(
    {
      empresa_id: parsed.data.empresa_id,
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
