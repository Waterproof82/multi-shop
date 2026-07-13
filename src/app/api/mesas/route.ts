import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMesaUseCase, getMesaSesionUseCase } from '@/core/infrastructure/database';
import { rateLimitMesaPolling } from '@/core/infrastructure/api/rate-limit';

const getMesaSchema = z.object({
  token: z.string().uuid('El token debe ser un UUID válido'),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = getMesaSchema.safeParse({ token: searchParams.get('token') });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const rateLimited = await rateLimitMesaPolling(parsed.data.token);
  if (rateLimited) return rateLimited;

  const mesaResult = await getMesaUseCase().getMesa(parsed.data.token);

  if (!mesaResult.success) {
    return NextResponse.json({ error: 'Error al obtener la mesa' }, { status: 500 });
  }

  if (!mesaResult.data) {
    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }

  const mesa = mesaResult.data;

  // Open a session the moment a customer accesses the table (idempotent via DB function)
  await getMesaSesionUseCase().openSesion(mesa.id, mesa.empresaId);

  return NextResponse.json({
    id: mesa.id,
    numero: mesa.numero,
    nombre: mesa.nombre,
    empresa_id: mesa.empresaId,
  });
}
