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
    const searchParams = new URL(request.url).searchParams;
    const promoIdParam = searchParams.get('promoId');
    const tokenParam = searchParams.get('token');

    const itemResult = await tgtgUseCase.getPublicItem(itemId);

    if (!itemResult.success) {
      return NextResponse.json({ error: 'Error al obtener oferta' }, { status: 500 });
    }
    if (!itemResult.data) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    const item = itemResult.data;

    // Check token usage and pickup time in parallel
    const promoId = promoIdParam ?? item.tgtgPromoId;
    const [promoResult, tokenUsedResult] = await Promise.all([
      promoId ? tgtgUseCase.getPublicPromo(promoId) : Promise.resolve(null),
      tokenParam ? tgtgUseCase.isTokenUsed(tokenParam) : Promise.resolve(null),
    ]);

    const horaRecogidaInicio = promoResult?.success && promoResult.data ? promoResult.data.horaRecogidaInicio : null;
    const horaRecogidaFin = promoResult?.success && promoResult.data ? promoResult.data.horaRecogidaFin : null;
    const fechaActivacion = promoResult?.success && promoResult.data ? promoResult.data.fechaActivacion : null;
    const tokenUsed = tokenUsedResult?.success ? tokenUsedResult.data : false;

    // Return only public-safe fields (no empresaId internal details)
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
      fechaActivacion,
      tokenUsed,
    });
  } catch (error) {
    await logApiError('Get public TGTG item', error, 'GET');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
