import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const bodySchema = z.object({
  nota: z.string().max(500).nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return validationErrorResponse('id inválido');

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { error } = await getSupabaseClient()
    .from('pedidos')
    .update({ nota: parsed.data.nota })
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
