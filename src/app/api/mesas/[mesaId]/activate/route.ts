import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const mesaIdSchema = z.string().uuid();

/**
 * POST /api/mesas/{mesaId}/activate
 *
 * Sets cliente_activo = true on the active session.
 * Called client-side when a real customer (non-waiter) adds their first product to the cart.
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

  // Tenant isolation: derive empresa from domain (public route — proxy does not inject x-empresa-id)
  let empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    const domain = await getDomainFromHeaders();
    const empresaResult = await getEmpresaPublicRepository().findByDomain(parseMainDomain(domain));
    if (!empresaResult.success || !empresaResult.data) {
      return NextResponse.json({ error: 'Tenant no identificado' }, { status: 400 });
    }
    empresaId = empresaResult.data.id;
  }

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
    .update({ cliente_activo: true })
    .eq('mesa_id', parsed.data)
    .is('cerrada_at', null);

  return NextResponse.json({ ok: true });
}
