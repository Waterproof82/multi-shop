import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMesaSesionRepository, getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { PAYMENT_LOCK_EXPIRY_MS } from '@/core/domain/constants/pedido';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({
  numPersonas: z.number().int().min(2).max(20),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const mesaParsed = mesaIdSchema.safeParse(mesaId);
  if (!mesaParsed.success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const bodyParsed = bodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: bodyParsed.error.errors[0].message }, { status: 400 });
  }

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
    .eq('id', mesaParsed.data)
    .eq('empresa_id', empresaId)
    .single();

  if (!mesa) return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });

  const sesionResult = await getMesaSesionRepository().findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  // Block if a payment is currently in progress (someone is at Redsys)
  const { data: sesionRow } = await supabase
    .from('mesa_sesiones')
    .select('pago_en_curso, pago_iniciado_en')
    .eq('id', sesionResult.data.id)
    .single();

  const lockFresh = sesionRow?.pago_iniciado_en
    ? Date.now() - new Date(sesionRow.pago_iniciado_en as string).getTime() < PAYMENT_LOCK_EXPIRY_MS
    : false;
  if (sesionRow?.pago_en_curso && lockFresh) {
    return NextResponse.json({ error: 'PAGO_EN_CURSO' }, { status: 409 });
  }

  const { error } = await supabase
    .from('mesa_sesiones')
    .update({
      division_personas: bodyParsed.data.numPersonas,
      division_pagos_realizados: 0,
    })
    .eq('id', sesionResult.data.id);

  if (error) {
    return NextResponse.json({ error: 'Error al guardar la división' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** Cancel the division — only allowed when no payments have been made yet */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const mesaParsed = mesaIdSchema.safeParse(mesaId);
  if (!mesaParsed.success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

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
    .eq('id', mesaParsed.data)
    .eq('empresa_id', empresaId)
    .single();

  if (!mesa) return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });

  const sesionResult = await getMesaSesionRepository().findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  // Only cancel if no payments have been made yet
  const { error } = await supabase
    .from('mesa_sesiones')
    .update({ division_personas: null, division_pagos_realizados: 0 })
    .eq('id', sesionResult.data.id)
    .eq('division_pagos_realizados', 0);

  if (error) {
    return NextResponse.json({ error: 'Error al cancelar la división' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
