import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole } from '@/core/infrastructure/api/helpers';
import { getLcGenerarResumenParcialUseCase } from '@/core/laborcontrol/infrastructure';
import { ResumenParcialQuerySchema } from '@/core/laborcontrol/application/dtos/export.dto';

// GET /api/laborcontrol/export/parcial?mes=M&anio=YYYY
// Art. 12.4.c ET — monthly summary PDF for part-time employees
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const sp = new URL(req.url).searchParams;
  const parsed = ResumenParcialQuerySchema.safeParse({
    mes:  sp.get('mes'),
    anio: sp.get('anio'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros mes/anio requeridos' }, { status: 400 });
  }

  const uc = getLcGenerarResumenParcialUseCase();
  const result = await uc.execute(ctx.empresaId, parsed.data.anio, parsed.data.mes);

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const { stream, contentType, filename } = result.data;
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(webStream, {
    headers: {
      'Content-Type':        contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
