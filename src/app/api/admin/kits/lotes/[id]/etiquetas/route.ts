// src/app/api/admin/kits/lotes/[id]/etiquetas/route.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// R-M5.1: resolveKitsAdminContext (403/503, vigilado por
// tests/compliance/kits-rutas-con-interruptor.test.ts) → caso de uso (datos)
// → renderer (PDF) → Readable a ReadableStream, patrón de
// api/laborcontrol/export/route.ts.
import { NextRequest, NextResponse } from 'next/server';
import type { Readable } from 'stream';
import { resolveKitsAdminContext } from '@/core/infrastructure/api/kits-admin-context';
import { handleResult } from '@/core/infrastructure/api/helpers';
import { getKitCaducidadRepository } from '@/core/infrastructure/database';
import { generarEtiquetasLoteUseCase } from '@/core/application/use-cases/kits/generarEtiquetasLote.use-case';
import { renderEtiquetasKitPdf } from '@/core/infrastructure/pdf/etiquetas-kit.renderer';
import type { EtiquetasLote } from '@/core/domain/entities/kit-caducidad-types';

/** DD10: limpia el código a `[A-Za-z0-9-]` — evita inyección en `Content-Disposition` (patrón de `tpv/audit/export`). Sufijo `-MUESTRA` si R-M5.4.1. */
function nombreFichero(d: EtiquetasLote): string {
  const codigoLimpio = d.codigoLote.replace(/[^A-Za-z0-9-]/g, '');
  const sufijoMuestra = d.muestra ? '-MUESTRA' : '';
  return `etiquetas-${codigoLimpio}-${d.pagina}${sufijoMuestra}.pdf`;
}

/** Convierte el `Readable` de Node del renderer en un `ReadableStream` web (igual que `laborcontrol/export/route.ts`). */
function aReadableStream(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveKitsAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const result = await generarEtiquetasLoteUseCase(getKitCaducidadRepository(), ctx.empresaId, id, {
    pagina: sp.get('pagina') ?? undefined,
  });
  if (!result.success) return handleResult(result);

  const pdfStream = await renderEtiquetasKitPdf(result.data);

  return new NextResponse(aReadableStream(pdfStream), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreFichero(result.data)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
