import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository, pedidoRepository } from '@/core/infrastructure/database';
import { rateLimitMesaPolling } from '@/core/infrastructure/api/rate-limit';
import { getSupabaseAnonClient, getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const rateLimited = await rateLimitMesaPolling(parsed.data);
  if (rateLimited) return rateLimited;

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(parsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar la sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ orders: [], sesionId: null, total: 0 });
  }

  const sesion = sesionResult.data;

  const ordersResult = await pedidoRepository.findBySesionId(sesion.id);
  if (!ordersResult.success) {
    return NextResponse.json({ error: 'Error al obtener los pedidos' }, { status: 500 });
  }

  const orders = ordersResult.data.map(o => ({
    id: o.id,
    numeroPedido: o.numero_pedido,
    items: o.detalle_pedido,
    total: o.total,
    estado: o.estado,
    createdAt: o.created_at,
  }));

  const total = ordersResult.data.reduce((sum, o) => sum + Number(o.total), 0);

  // Check if mesa payments are enabled for this empresa
  let pagosHabilitados = false;
  try {
    const supabase = getSupabaseAnonClient();
    const { data: emp } = await supabase
      .from('empresas')
      .select('pagos_mesa_habilitados')
      .eq('id', sesion.empresaId)
      .single();
    pagosHabilitados = (emp as { pagos_mesa_habilitados: boolean } | null)?.pagos_mesa_habilitados ?? false;
  } catch {
    // best-effort — default false
  }

  // Fetch division state from the session (service_role to bypass RLS)
  let division: { personas: number; pagosRealizados: number; importePorPersona: number } | null = null;
  try {
    const supabaseAdmin = getSupabaseClient();
    const { data: sesionRow } = await supabaseAdmin
      .from('mesa_sesiones')
      .select('division_personas, division_pagos_realizados')
      .eq('id', sesion.id)
      .single();

    const row = sesionRow as { division_personas: number | null; division_pagos_realizados: number } | null;
    if (row?.division_personas) {
      const personas = row.division_personas;
      const pagosRealizados = row.division_pagos_realizados;
      const importePorPersona = Math.round((total / personas) * 100) / 100;
      division = { personas, pagosRealizados, importePorPersona };
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ orders, sesionId: sesion.id, total, pagosHabilitados, division });
}
