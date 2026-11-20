// src/app/api/admin/mascotas/lotes/[id]/etiquetas/route.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 8 — calco de `api/admin/kits/lotes/[id]/etiquetas/route.ts` (M5):
// resolveMascotasAdminContext (403/503) → caso de uso (datos) → renderer
// (PDF) → Readable a ReadableStream.
import { NextRequest, NextResponse } from 'next/server';
import type { Readable } from 'stream';
import { resolveMascotasAdminContext } from '@/core/infrastructure/api/mascotas-admin-context';
import { handleResult } from '@/core/infrastructure/api/helpers';
import { getPetChapaAdminRepository } from '@/core/infrastructure/database';
import { generarEtiquetasLoteUseCase } from '@/core/application/use-cases/mascotas/generarEtiquetasLote.use-case';
import { renderEtiquetasChapaPdf } from '@/core/infrastructure/pdf/etiquetas-chapa.renderer';
import type { EtiquetasLotePet } from '@/core/domain/entities/pet-chapa-types';

/** Limpia el código a `[A-Za-z0-9-]` — evita inyección en `Content-Disposition`. Sufijo `-MUESTRA` si R-QR.14.4. */
function nombreFichero(d: EtiquetasLotePet): string {
  const codigoLimpio = d.codigoLote.replace(/[^A-Za-z0-9-]/g, '');
  const sufijoMuestra = d.muestra ? '-MUESTRA' : '';
  return `etiquetas-${codigoLimpio}-${d.pagina}${sufijoMuestra}.pdf`;
}

/** Convierte el `Readable` de Node del renderer en un `ReadableStream` web (igual que `etiquetas/route.ts` de kits). */
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
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const result = await generarEtiquetasLoteUseCase(getPetChapaAdminRepository(), ctx.empresaId, id, {
    pagina: sp.get('pagina') ?? undefined,
  });
  if (!result.success) return handleResult(result);

  const pdfStream = await renderEtiquetasChapaPdf(result.data);

  return new NextResponse(aReadableStream(pdfStream), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreFichero(result.data)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
