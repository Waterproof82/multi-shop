// src/app/api/admin/mascotas/lotes/[id]/csv/route.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 8 — R-QR.14.3: CSV `codigo,url` de TODO el lote (sin paginar) para
// que el proveedor imprima con datos variables. resolveMascotasAdminContext
// (403/503) → caso de uso (datos) → `construirCsvChapas` (texto).
import { NextRequest, NextResponse } from 'next/server';
import { resolveMascotasAdminContext } from '@/core/infrastructure/api/mascotas-admin-context';
import { handleResult } from '@/core/infrastructure/api/helpers';
import { getPetChapaAdminRepository } from '@/core/infrastructure/database';
import { generarCsvLoteUseCase } from '@/core/application/use-cases/mascotas/generarCsvLote.use-case';
import { construirCsvChapas } from '@/lib/pet-id/csv';

/** Limpia el código a `[A-Za-z0-9-]` — evita inyección en `Content-Disposition` (mismo patrón que el PDF). */
function nombreFicheroCsv(codigoLote: string): string {
  const codigoLimpio = codigoLote.replace(/[^A-Za-z0-9-]/g, '');
  return `chapas-${codigoLimpio}.csv`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveMascotasAdminContext(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await generarCsvLoteUseCase(getPetChapaAdminRepository(), ctx.empresaId, id);
  if (!result.success) return handleResult(result);

  const csv = construirCsvChapas(result.data.etiquetas);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreFicheroCsv(result.data.codigoLote)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
