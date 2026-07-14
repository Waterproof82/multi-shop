import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getEmpresaUseCase } from '@/core/infrastructure/database';
import { resolveAdminContext, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import type { EmpresaColores } from '@/core/domain/entities/types';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color debe ser hexadecimal (#RRGGBB)');

const updateColoresSchema = z.object({
  colores: z.object({
    primary: hexColor,
    primaryForeground: hexColor,
    secondary: hexColor,
    secondaryForeground: hexColor,
    accent: hexColor,
    accentForeground: hexColor,
    background: hexColor,
    foreground: hexColor,
  }),
});

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = updateColoresSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getEmpresaUseCase().updateColores(empresaId!, parsed.data.colores as EmpresaColores);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
