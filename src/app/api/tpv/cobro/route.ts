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
import { resolveImpuestoPorcentaje } from '@/lib/tpv/impuesto';
import { z } from 'zod';

interface RawPedidoItem {
  nombre?: string | null;
  precio?: number | null;
  cantidad?: number | null;
  producto_id?: string | null;
}

interface RawPedido {
  detalle_pedido?: RawPedidoItem[] | null;
}

function buildDetalleItems(
  pedidos: RawPedido[],
  overrideMap: Map<string, number | null>,
  empresaPorcentaje: number,
): TpvDetalleItem[] {
  const map = new Map<string, TpvDetalleItem>();
  for (const pedido of pedidos) {
    for (const item of pedido.detalle_pedido ?? []) {
      const nombre = item.nombre ?? '';
      const precioUnitarioCents = Math.round((item.precio ?? 0) * 100);
      const override = item.producto_id ? (overrideMap.get(item.producto_id) ?? null) : null;
      const ivaPorcentaje = resolveImpuestoPorcentaje(override, empresaPorcentaje);
      const key = `${nombre}|${precioUnitarioCents}|${ivaPorcentaje}`;
      const prev = map.get(key);
      map.set(key, {
        nombre,
        precioUnitarioCents,
        ivaPorcentaje,
        cantidad: (prev?.cantidad ?? 0) + (item.cantidad ?? 1),
      });
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
    ivaPorcentaje: z.number().min(0).max(100).optional(),
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
    const [{ data: pedidos }, { data: empresaRow }] = await Promise.all([
      supabase
        .from('pedidos')
        .select('detalle_pedido')
        .eq('sesion_id', parsed.data.sesionId)
        .neq('estado', 'cancelado'),
      supabase
        .from('empresas')
        .select('porcentaje_impuesto')
        .eq('id', empresaId)
        .maybeSingle(),
    ]);
    if (pedidos && pedidos.length > 0) {
      const rawPedidos = pedidos as RawPedido[];
      const empresaPorcentaje = (empresaRow as { porcentaje_impuesto: number | null } | null)?.porcentaje_impuesto ?? 10;
      const productoIds = [...new Set(
        rawPedidos
          .flatMap(p => (p.detalle_pedido ?? []).map(i => i.producto_id))
          .filter((id): id is string => Boolean(id)),
      )];
      const overrideMap = new Map<string, number | null>();
      if (productoIds.length > 0) {
        const { data: productosData } = await supabase
          .from('productos')
          .select('id, porcentaje_impuesto_override')
          .in('id', productoIds);
        for (const p of (productosData ?? []) as { id: string; porcentaje_impuesto_override: number | null }[]) {
          overrideMap.set(p.id, p.porcentaje_impuesto_override ?? null);
        }
      }
      detalleItems = buildDetalleItems(rawPedidos, overrideMap, empresaPorcentaje);
    }
  }

  const empleadoId =
    req.headers.get('x-employee-id') ?? req.headers.get('x-admin-id') ?? null;

  const repo = getTpvRepository();
  const result = await registrarCobroUseCase(repo, {
    ...parsed.data,
    empresaId,
    cerrarSesion: parsed.data.cerrarSesion,
    detalleItems,
    empleadoId,
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
