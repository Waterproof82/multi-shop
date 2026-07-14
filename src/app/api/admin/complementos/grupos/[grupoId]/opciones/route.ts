import { type NextRequest } from 'next/server';
import { getComplementoGrupoUseCase } from '@/core/infrastructure/database';
import { createComplementoOpcionSchema } from '@/core/application/dtos/complemento.dto';
import { resolveAdminContext, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

interface Params {
  params: Promise<{ grupoId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { grupoId } = await params;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = createComplementoOpcionSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const result = await getComplementoGrupoUseCase().createOpcion({
    grupoId,
    empresaId: empresaId,
    nombre_es: parsed.data.nombre_es,
    nombre_en: parsed.data.nombre_en,
    nombre_fr: parsed.data.nombre_fr,
    nombre_it: parsed.data.nombre_it,
    nombre_de: parsed.data.nombre_de,
    precioAdicional: parsed.data.precio_adicional,
    orden: parsed.data.orden,
  });
  return handleResultWithStatus(result, 201);
}
