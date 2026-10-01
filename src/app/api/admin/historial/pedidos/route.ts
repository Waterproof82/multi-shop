import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAdminContextWithEmpresa, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getHistorialUseCase } from '@/core/infrastructure/database';

const querySchema = z.object({
  ejercicio: z.coerce.number().int().min(2000).max(2100),
});

/** GET /api/admin/historial/pedidos?ejercicio=2026 → CSV con los pedidos de ese ejercicio. */
export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const parsed = querySchema.safeParse({ ejercicio: new URL(request.url).searchParams.get('ejercicio') });
  if (!parsed.success) {
    return validationErrorResponse('Ejercicio no válido');
  }

  const { ejercicio } = parsed.data;
  const result = await getHistorialUseCase().exportarPedidosCsv(ctx.empresaId, ejercicio);
  if (!result.success) return handleResult(result);

  return new NextResponse(result.data, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-${ejercicio}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
