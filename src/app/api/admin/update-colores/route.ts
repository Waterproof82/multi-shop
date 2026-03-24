import { NextRequest } from 'next/server';
import { z } from 'zod';
import { empresaUseCase } from '@/core/infrastructure/database';
import { requireAuth, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
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
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = updateColoresSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await empresaUseCase.updateColores(empresaId!, parsed.data.colores as EmpresaColores);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
