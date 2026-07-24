import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole } from '@/core/infrastructure/api/helpers';
import { getLcGenerarExportUseCase } from '@/core/laborcontrol/infrastructure';
import { ExportQuerySchema } from '@/core/laborcontrol/application/dtos/export.dto';

// GET /api/laborcontrol/export?tipo=pdf|excel&from=YYYY-MM-DD&to=YYYY-MM-DD&...
// Streams PDF or Excel file
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const sp = new URL(req.url).searchParams;
  const parsed = ExportQuerySchema.safeParse({
    tipo:              sp.get('tipo'),
    empleadoId:        sp.get('empleadoId') ?? undefined,
    centroId:          sp.get('centroId') ?? undefined,
    from:              sp.get('from'),
    to:                sp.get('to'),
    incluirHorasExtra: sp.get('incluirHorasExtra') ?? 'true',
    incluirPausas:     sp.get('incluirPausas') ?? 'true',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uc = getLcGenerarExportUseCase();
  const result = await uc.execute(ctx.empresaId, {
    empleadoId:            parsed.data.empleadoId ?? null,
    centroId:              parsed.data.centroId ?? null,
    from:                  new Date(parsed.data.from),
    to:                    new Date(parsed.data.to + 'T23:59:59.999Z'),
    format:                parsed.data.tipo,
    incluirPausas:         parsed.data.incluirPausas,
    incluirHorasExtra:     parsed.data.incluirHorasExtra,
    incluirResumenParcial: false,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const { stream, contentType, filename } = result.data;
  // Convert Node.js Readable to Web ReadableStream for Next.js
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
