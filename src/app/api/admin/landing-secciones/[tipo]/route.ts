import { type NextRequest } from 'next/server';
import { getLandingSeccionUseCase } from '@/core/infrastructure/database';
import { upsertLandingSeccionSchema, parseContenidoPorTipo } from '@/core/application/dtos/landing-seccion.dto';
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from '@/core/domain/entities/types';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

interface Params {
  params: Promise<{ tipo: string }>;
}

function isLandingSeccionTipo(value: string): value is LandingSeccionTipo {
  return (LANDING_SECCION_TIPOS as readonly string[]).includes(value);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { tipo } = await params;
  if (!isLandingSeccionTipo(tipo)) {
    return validationErrorResponse('Tipo de sección inválido');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsedEnvelope = upsertLandingSeccionSchema.safeParse(body);
  if (!parsedEnvelope.success) {
    return validationErrorResponse(parsedEnvelope.error.issues[0].message);
  }

  const parsedContenido = parseContenidoPorTipo(tipo, parsedEnvelope.data.contenido);
  if (!parsedContenido.success) {
    return validationErrorResponse(parsedContenido.error.issues[0].message);
  }

  const result = await getLandingSeccionUseCase().upsert(empresaId, tipo, {
    activo: parsedEnvelope.data.activo,
    orden: parsedEnvelope.data.orden,
    // parseContenidoPorTipo no anota su tipo de retorno (ver comentario en
    // landing-seccion.dto.ts) para no depender de nombres internos de Zod,
    // así que acá `.data` llega como `unknown` — el cast es seguro porque
    // ya pasó `.success` arriba y todos los schemas de contenido son
    // z.object(), cuyo output siempre es un objeto plano.
    contenido: parsedContenido.data as Record<string, unknown>,
  });
  return handleResultWithStatus(result);
}
