import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { registrarCobroUseCase } from '@/core/application/use-cases/tpv/registrar-cobro.use-case';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { type TpvDetalleItem } from '@/core/domain/entities/tpv-types';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';
import { z } from 'zod';

interface RawPedidoItem {
  nombre?: string | null;
  precio?: number | null;
  cantidad?: number | null;
}

interface RawPedido {
  detalle_pedido?: RawPedidoItem[] | null;
}

function buildDetalleItems(pedidos: RawPedido[]): TpvDetalleItem[] {
  const map = new Map<string, { nombre: string; cantidad: number; precioUnitarioCents: number }>();
  for (const pedido of pedidos) {
    for (const item of pedido.detalle_pedido ?? []) {
      const nombre = item.nombre ?? '';
      const precioUnitarioCents = Math.round((item.precio ?? 0) * 100);
      const key = `${nombre}|${precioUnitarioCents}`;
      const prev = map.get(key) ?? { nombre, cantidad: 0, precioUnitarioCents };
      map.set(key, { ...prev, cantidad: prev.cantidad + (item.cantidad ?? 1) });
    }
  }
  return Array.from(map.values());
}

const CobroSchema = z.object({
  sesionId: z.string().uuid(),
  metodoPago: z.enum(['efectivo', 'tarjeta']),
  importeCobradoCents: z.number().int().positive(),
  propinaCents: z.number().int().min(0),
  descuentoCents: z.number().int().min(0).optional().default(0),
  turnoId: z.string().uuid(),
  ivaPorcentaje: z.number().min(0).max(100).optional().default(10),
  cerrarSesion: z.boolean().optional().default(true),
  detalleItems: z.array(z.object({
    nombre: z.string().max(200),
    cantidad: z.number().int().positive(),
    precioUnitarioCents: z.number().int().min(0),
    impuestoPorcentaje: z.number().min(0).max(100).optional(),
  })).optional(),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CobroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let detalleItems = parsed.data.detalleItems;
  if (!detalleItems && parsed.data.sesionId) {
    const supabase = getSupabaseClient();
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('detalle_pedido')
      .eq('sesion_id', parsed.data.sesionId)
      .neq('estado', 'cancelado');
    if (pedidos && pedidos.length > 0) {
      detalleItems = buildDetalleItems(pedidos as RawPedido[]);
    }
  }

  const repo = getTpvRepository();
  const result = await registrarCobroUseCase(repo, {
    ...parsed.data,
    empresaId,
    cerrarSesion: parsed.data.cerrarSesion,
    detalleItems,
  });

  if (result.success) {
    const actor = resolveActor(req);
    void getAuditLogRepository().insert({
      empresaId,
      action: 'tpv.cobro.completar',
      payload: {
        turnoId: parsed.data.turnoId,
        totalCents: parsed.data.importeCobradoCents,
        metodo: parsed.data.metodoPago,
      },
      ...actor,
    });
  }

  return handleResult(result);
}
