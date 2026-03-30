import { NextRequest, NextResponse } from 'next/server';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const { id: itemId } = await params;

  try {
    const [itemResult, promoIdParam] = await Promise.all([
      tgtgUseCase.getPublicItem(itemId),
      Promise.resolve(new URL(request.url).searchParams.get('promoId')),
    ]);

    if (!itemResult.success) {
      return NextResponse.json({ error: 'Error al obtener oferta' }, { status: 500 });
    }
    if (!itemResult.data) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    const item = itemResult.data;

    // Fetch pickup time from promo
    let horaRecogidaInicio: string | null = null;
    let horaRecogidaFin: string | null = null;
    const promoId = promoIdParam ?? item.tgtgPromoId;
    if (promoId) {
      const promoResult = await tgtgUseCase.getPublicPromo(promoId);
      if (promoResult.success && promoResult.data) {
        horaRecogidaInicio = promoResult.data.horaRecogidaInicio;
        horaRecogidaFin = promoResult.data.horaRecogidaFin;
      }
    }

    // Return only public-safe fields (no token, no empresaId internal details)
    return NextResponse.json({
      item: {
        id: item.id,
        titulo: item.titulo,
        descripcion: item.descripcion,
        imagenUrl: item.imagenUrl,
        precioOriginal: item.precioOriginal,
        precioDescuento: item.precioDescuento,
        cuponesDisponibles: item.cuponesDisponibles,
        tgtgPromoId: item.tgtgPromoId,
      },
      horaRecogidaInicio,
      horaRecogidaFin,
    });
  } catch (error) {
    await logApiError('Get public TGTG item', error, 'GET');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
