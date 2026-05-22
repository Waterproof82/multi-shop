import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { mesaSesionUseCase } from '@/core/infrastructure/database';

const mesaSchema = z.object({
  mesaNumero: z.number().int().positive(),
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

  const parsed = mesaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { data: mesa } = await supabase
    .from('mesas')
    .select('id, numero, nombre')
    .eq('empresa_id', empresaId)
    .eq('numero', parsed.data.mesaNumero)
    .maybeSingle();

  if (!mesa) {
    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }

  // Open (or reuse) the mesa session — idempotent RPC
  await mesaSesionUseCase.openSesion(mesa.id as string, empresaId);

  return NextResponse.json({ ok: true, mesaId: mesa.id, mesaNumero: mesa.numero, mesaNombre: mesa.nombre });
}
