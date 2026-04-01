import { NextRequest, NextResponse } from 'next/server';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, errorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { createTgtgSchema } from '@/core/application/dtos/tgtg.dto';


export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as { empresaId: string | null; error: NextResponse | null; isSuperAdmin: boolean };
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const allResult = await tgtgUseCase.getAllRecent(empresaId!);
  if (!allResult.success) {
    return NextResponse.json({ error: allResult.error.message }, { status: 500 });
  }

  // For each campaign fetch reservas counts
  const campaigns = await Promise.all(
    allResult.data.map(async ({ promo, items }) => {
      const reservasResult = await tgtgUseCase.getReservas(empresaId!, promo.id);
      const reservasByItem: Record<string, number> = {};
      if (reservasResult.success) {
        for (const r of reservasResult.data) {
          reservasByItem[r.itemId] = (reservasByItem[r.itemId] ?? 0) + 1;
        }
      }
      return {
        ...promo,
        items: items.map((item) => ({ ...item, reservasCount: reservasByItem[item.id] ?? 0 })),
      };
    })
  );

  return NextResponse.json({ campaigns });
}

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as { empresaId: string | null; error: NextResponse | null; isSuperAdmin: boolean };
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = createTgtgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { hora_recogida_inicio, hora_recogida_fin, fecha_activacion, items } = parsed.data;
  const today = new Date().toISOString().split('T')[0];

  const fechaEfectiva = fecha_activacion ?? today;
  const pickupEnd = new Date(`${fechaEfectiva}T${hora_recogida_fin}:00`);
  if (isNaN(pickupEnd.getTime()) || pickupEnd <= new Date()) {
    return NextResponse.json({ error: 'La fecha y hora de fin de recogida debe ser posterior a la hora actual.' }, { status: 400 });
  }

  try {
    const createResult = await tgtgUseCase.create(
      empresaId!,
      hora_recogida_inicio,
      hora_recogida_fin,
      fecha_activacion ?? today,
      items.map((item, index) => ({
        titulo: item.titulo,
        descripcion: item.descripcion,
        imagenUrl: item.imagen_url,
        precioOriginal: item.precio_original,
        precioDescuento: item.precio_descuento,
        cuponesTotal: item.cupones_total,
        orden: index,
      })),
    );

    if (!createResult.success) {
      return NextResponse.json({ error: createResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ tgtgPromo: createResult.data.promo });
  } catch (error) {
    await logApiError('Create TGTG promo', error, 'POST');
    return errorResponse('Error interno');
  }
}
